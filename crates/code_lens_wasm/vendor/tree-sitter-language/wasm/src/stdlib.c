// CodeLens Wasm patch (2026-08-07) — tree-sitter-language 0.1.7 wasm stdlib
// allocator, replaced by a HYBRID design. See history below.
//
// UPSTREAM BUG (why this file is patched): the upstream bump allocator's heap
// is only initialized by reset_heap(), called solely from src/wasm_store.c —
// a file entirely #ifdef TREE_SITTER_FEATURE_WASM (wasmtime-backed), never
// compiled in wasm-bindgen builds. The heap stayed NULL: allocations landed at
// address ~8, overlapping module data + Rust's dlmalloc heap, corrupting
// memory at scale (~11k nodes) — ts_subtree_retain ref_count asserts / OOB.
//
// EXPERIMENT HISTORY (all validated on the probe ladder json 100 -> 1000 ->
// 5000 items AND at 375k nodes, worst case):
// 1. Upstream port + ensure_heap() auto-init + 1GB cap: fixes the NULL-heap
//    bug, BUT is fundamentally broken in wasm-bindgen builds — TWO allocators
//    (this bump + Rust's dlmalloc) grow the SAME linear memory from the top.
//    When dlmalloc grows memory mid-parse it claims the new top region, C's
//    heap_end goes stale-low, and the next bump writes into dlmalloc's data
//    (memory access out of bounds; sequence-dependent).
// 2. Pure forwarding (C malloc/free -> Rust dlmalloc via ts_c_alloc/dealloc):
//    crash-free — but dlmalloc first-fit scanning on the fragmented parser
//    heap degrades quadratically (~43k reallocs at ~36us each at 55k nodes).
// 3. Hybrid v1: forward NEW blocks to dlmalloc; retain freed blocks in C-side
//    LIFO free bins (32 power-of-2 classes) + capacity-based in-place realloc
//    with doubling. Fixed correctness and made the 55k-node ladder linear,
//    BUT bin_take still SCANNED a bucket for a fit: at 375k nodes the bins
//    hold hundreds of thousands of blocks and scans became O(n) per alloc
//    again (parseMs 5.4us/node, ~8.6s glue gap).
// 4. THIS VERSION: O(1) size-class buckets. malloc ROUNDS the request up to a
//    power-of-two class (min 16) and sets capacity = class size; every block
//    in a bucket therefore fits any request in that class, so bin_take is a
//    plain head-pop — no scan, ever. Internal fragmentation <= 2x on the C
//    heap (acceptable: subtree blocks ~100-200B). dlmalloc is asked for NEW
//    memory only when a class bucket is empty; freed blocks stay in C.
#include <stdint.h>
#include <stddef.h>
#include <string.h>

// Provided by lib.rs (wasm32-gated #[unsafe(no_mangle)] extern "C") —
// std::alloc::alloc / dealloc with Layout::from_size_align(size.max(1), 8).
extern void *ts_c_alloc(size_t size);
extern void ts_c_dealloc(void *ptr, size_t size);

#define NUM_BINS 32
#define MIN_CLASS 16

typedef struct Region {
  size_t size;        // logical size (used for memcpy in realloc)
  size_t capacity;    // allocated capacity == size class (power of two)
  struct Region *next; // free-list link while in a bin
  char data[0];
} Region;

static Region *free_bins[NUM_BINS];

static inline Region *region_for_ptr(void *ptr) {
  return ((Region *)ptr) - 1;
}

static inline size_t class_of(size_t size) {
  size_t c = MIN_CLASS;
  while (c < size) c <<= 1;
  return c;
}

static inline int bin_of(size_t capacity) {
  int b = 0;
  size_t v = capacity;
  while (v >>= 1) b++;
  return b;
}

// Clear out the heap, and move it to the given address.
// No-op: blocks are retained in the C bins and reused across parses
// (memory stays in C; dlmalloc is only asked for NEW growth).
void reset_heap(void *new_heap_start) {
  (void)new_heap_start;
}

void *malloc(size_t size) {
  if (size == 0) return NULL;

  size_t capacity = class_of(size);
  int bin = bin_of(capacity);

  Region *region = free_bins[bin];
  if (region != NULL) {
    // Head-pop: every block in this bin has capacity == this class, so it
    // always fits — O(1), no scan.
    free_bins[bin] = region->next;
  } else {
    region = (Region *)ts_c_alloc(sizeof(Region) + capacity);
    if (!region) return NULL;
  }

  region->size = size;
  region->capacity = capacity;
  return &region->data;
}

void free(void *ptr) {
  if (ptr == NULL) return;

  Region *region = region_for_ptr(ptr);
  int bin = bin_of(region->capacity);
  region->next = free_bins[bin];
  free_bins[bin] = region;
}

void *calloc(size_t count, size_t size) {
  size_t total = count * size;
  void *result = malloc(total);
  if (!result) return NULL;
  memset(result, 0, total);
  return result;
}

void *realloc(void *ptr, size_t new_size) {
  if (ptr == NULL) {
    return malloc(new_size);
  }
  if (new_size == 0) {
    free(ptr);
    return NULL;
  }

  Region *region = region_for_ptr(ptr);
  size_t new_capacity = class_of(new_size);

  // In-place when the new size stays within the same class — O(1), and the
  // parser's array-doubling pattern only changes class every other growth.
  if (new_capacity == region->capacity) {
    region->size = new_size;
    return ptr;
  }

  void *new_ptr = malloc(new_size);
  if (!new_ptr) return NULL;
  memcpy(new_ptr, &region->data, region->size < new_size ? region->size : new_size);
  free(ptr);
  return new_ptr;
}

__attribute__((noreturn)) void abort(void) {
  __builtin_trap();
}
