use wasm_bindgen::prelude::*;

// NOTE: In tree-sitter 0.26 and tree-sitter-language 0.1.7:
// tree-sitter-typescript 0.23.2 exports LANGUAGE_TYPESCRIPT and LANGUAGE_TSX as LanguageFn.
// tree-sitter-rust 0.24.2 exports LANGUAGE as LanguageFn.
// tree-sitter-json 0.24.8 exports LANGUAGE as LanguageFn.
// Each implements Into<tree_sitter::Language>. If constant names differ in specific revisions
// (e.g. LANGUAGE_TS vs LANGUAGE_TYPESCRIPT), adjust accordingly.
fn get_language(lang: &str) -> Result<tree_sitter::Language, String> {
    match lang {
        "ts" => Ok(tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()),
        "tsx" => Ok(tree_sitter_typescript::LANGUAGE_TSX.into()),
        "rust" => Ok(tree_sitter_rust::LANGUAGE.into()),
        "json" => Ok(tree_sitter_json::LANGUAGE.into()),
        _ => Err(format!("unknown language: {}", lang)),
    }
}

fn fnv1a_32_hex(source: &str) -> String {
    let mut hash: u32 = 2166136261;
    for byte in source.bytes() {
        hash = (hash ^ (byte as u32)).wrapping_mul(16777619);
    }
    format!("{:08x}", hash)
}

struct Frame<'a> {
    node: tree_sitter::Node<'a>,
    field_name: Option<String>,
    children_json: Vec<String>,
    next_child_index: u32,
}

fn make_node_fragment(
    node: &tree_sitter::Node,
    field_name: Option<String>,
    source: &str,
    children_json: &str,
) -> String {
    let is_leaf = children_json.is_empty();
    let text_val = if is_leaf {
        let raw_text = node.utf8_text(source.as_bytes()).unwrap_or("");
        let truncated: String = raw_text.chars().take(60).collect();
        serde_json::to_string(&truncated).unwrap_or_else(|_| "\"\"".to_string())
    } else {
        "null".to_string()
    };
    format!(
        "{{\"type\":{},\"named\":{},\"fieldName\":{},\"error\":{},\"start\":{{\"row\":{},\"column\":{},\"byte\":{}}},\"end\":{{\"row\":{},\"column\":{},\"byte\":{}}},\"text\":{},\"children\":[{}]}}",
        serde_json::to_string(node.kind()).unwrap_or_else(|_| "\"\"".to_string()),
        node.is_named(),
        field_name
            .map(|f| serde_json::to_string(&f).unwrap_or_else(|_| "\"\"".to_string()))
            .unwrap_or_else(|| "null".to_string()),
        node.is_error() || node.is_missing(),
        node.start_position().row,
        node.start_position().column,
        node.start_byte(),
        node.end_position().row,
        node.end_position().column,
        node.end_byte(),
        text_val,
        children_json
    )
}

#[cfg(target_arch = "wasm32")]
fn now_ms() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
        * 1000.0
}

pub fn parse_to_json(source: &str, language: &str) -> Result<serde_json::Value, String> {
    serde_json::from_str(&parse_to_json_string(source, language)?).map_err(|e| e.to_string())
}

pub fn parse_to_json_string(source: &str, language: &str) -> Result<String, String> {
    let ts_lang = get_language(language)?;
    let mut parser = tree_sitter::Parser::new();
    parser
        .set_language(&ts_lang)
        .map_err(|e| format!("Failed to set language: {:?}", e))?;

    let start = now_ms();
    let tree = parser
        .parse(source, None)
        .ok_or_else(|| "Failed to parse source code".to_string())?;
    let parse_ms = now_ms() - start;

    let root_node = tree.root_node();
    let source_hash = fnv1a_32_hex(source);

    let mut node_count: u64 = 0;
    let mut error_count: u64 = 0;

    // Iterative traversal stack
    if root_node.child_count() == 0 {
        node_count += 1;
        if root_node.is_error() || root_node.is_missing() {
            error_count += 1;
        }
        let ast_str = make_node_fragment(&root_node, None, source, "");
        let parse_ms_str = serde_json::to_string(&((parse_ms * 100.0).round() / 100.0))
            .unwrap_or_else(|_| "0".to_string());
        let json_str = format!(
            "{{\"language\":{},\"sourceHash\":{},\"parseMs\":{},\"nodeCount\":{},\"errorCount\":{},\"ast\":{}}}",
            serde_json::to_string(language).unwrap_or_else(|_| "\"\"".to_string()),
            serde_json::to_string(&source_hash).unwrap_or_else(|_| "\"\"".to_string()),
            parse_ms_str,
            node_count,
            error_count,
            ast_str
        );
        return Ok(json_str);
    }

    node_count += 1;
    if root_node.is_error() || root_node.is_missing() {
        error_count += 1;
    }

    let mut stack = vec![Frame {
        node: root_node,
        field_name: None,
        children_json: Vec::new(),
        next_child_index: 0,
    }];

    let mut final_ast: Option<String> = None;

    while !stack.is_empty() {
        let (has_child, child_idx) = {
            let top = stack.last().unwrap();
            (
                top.next_child_index < top.node.child_count() as u32,
                top.next_child_index,
            )
        };

        if has_child {
            stack.last_mut().unwrap().next_child_index += 1;
            let parent_node = stack.last().unwrap().node;
            if let Some(child) = parent_node.child(child_idx) {
                let field_name = parent_node
                    .field_name_for_child(child_idx)
                    .map(|s| s.to_string());

                node_count += 1;
                if child.is_error() || child.is_missing() {
                    error_count += 1;
                }

                if child.child_count() == 0 {
                    let frag = make_node_fragment(&child, field_name, source, "");
                    stack.last_mut().unwrap().children_json.push(frag);
                } else {
                    stack.push(Frame {
                        node: child,
                        field_name,
                        children_json: Vec::new(),
                        next_child_index: 0,
                    });
                }
            }
        } else {
            let finished_frame = stack.pop().unwrap();
            let frag = make_node_fragment(
                &finished_frame.node,
                finished_frame.field_name,
                source,
                &finished_frame.children_json.join(","),
            );

            if stack.is_empty() {
                final_ast = Some(frag);
            } else {
                stack.last_mut().unwrap().children_json.push(frag);
            }
        }
    }

    let ast_str = final_ast.ok_or_else(|| "Failed to construct AST".to_string())?;
    let parse_ms_str = serde_json::to_string(&((parse_ms * 100.0).round() / 100.0))
        .unwrap_or_else(|_| "0".to_string());
    let json_str = format!(
        "{{\"language\":{},\"sourceHash\":{},\"parseMs\":{},\"nodeCount\":{},\"errorCount\":{},\"ast\":{}}}",
        serde_json::to_string(language).unwrap_or_else(|_| "\"\"".to_string()),
        serde_json::to_string(&source_hash).unwrap_or_else(|_| "\"\"".to_string()),
        parse_ms_str,
        node_count,
        error_count,
        ast_str
    );
    Ok(json_str)
}

/// Returns the parse result as a JSON **string** (not a JsValue object):
/// serde-wasm-bindgen's to_value silently produced empty objects
/// ({} for any value) on wasm32-unknown-unknown with 0.6.5 x wasm-bindgen
/// 0.2.126, while string transport is proven reliable. The worker JSON.parses.
#[wasm_bindgen]
pub fn parse(source: &str, language: &str) -> Result<String, JsValue> {
    parse_to_json_string(source, language).map_err(|e| JsValue::from_str(&e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ts_sample_returns_expected_node_counts() {
        let sample =
            "const x: number = 42;\nfunction add(a: number, b: number): number { return a + b; }";
        let res = parse_to_json(sample, "ts").expect("parse ts failed");
        let node_count = res["nodeCount"].as_u64().unwrap();
        assert!(node_count >= 5);
        let json_str = res.to_string();
        assert!(json_str.contains("variable_declarator"));
    }

    #[test]
    fn parse_rust_sample_has_field_names() {
        let sample = "fn main() {}";
        let res = parse_to_json(sample, "rust").expect("parse rust failed");
        let json_str = res.to_string();
        assert!(json_str.contains("\"fieldName\":\"name\""));
    }

    #[test]
    fn parse_json_error_recovery_marks_error_nodes() {
        let sample = "{\"a\": }";
        let res = parse_to_json(sample, "json").expect("parse invalid json failed");
        let error_count = res["errorCount"].as_u64().unwrap();
        assert!(error_count >= 1);
    }

    #[test]
    fn parse_empty_source_returns_root_with_children() {
        let sample = "";
        let res = parse_to_json(sample, "ts").expect("parse empty source failed");
        let node_count = res["nodeCount"].as_u64().unwrap();
        assert!(node_count >= 1);
    }

    #[test]
    fn parse_deeply_nested_input_does_not_overflow() {
        let sample = format!("{}{}", "(".repeat(10_000), ")".repeat(10_000));
        let res = parse_to_json(&sample, "ts");
        assert!(res.is_ok());
    }

    #[test]
    fn parse_unknown_language_returns_error() {
        let res = parse_to_json("print('hello')", "python");
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), "unknown language: python");
    }

    #[test]
    fn parse_one_mb_fixture_completes_budget() {
        // ~1MB JSON fixture
        let chunk = "{\"a\": [1, 2, 3]},";
        let repeated = chunk.repeat(60_000);
        let sample = format!("[{}]", repeated.trim_end_matches(','));

        let res = parse_to_json(&sample, "json").expect("parse 1MB json failed");
        let parse_ms = res["parseMs"].as_f64().unwrap();
        // Informational on native; strict budget is browser NFR-01 checked in Phase 2.
        assert!(
            parse_ms < 5000.0,
            "parseMs was {} ms, expected < 5000ms",
            parse_ms
        );
    }
}

#[cfg(all(target_arch = "wasm32", test))]
mod wasm_tests {
    use super::*;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    fn binding_parse_returns_valid_json_roundtrip() {
        let result = parse("const x: number = 42;", "ts");
        assert!(result.is_ok());
        let json_str = result.unwrap();
        let parsed: serde_json::Value =
            serde_json::from_str(&json_str).expect("invalid JSON string");
        assert!(
            parsed
                .get("nodeCount")
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
                > 0
        );
    }
}

/// Minimal libc wide-char stubs for tree-sitter scanner.c objects.
/// wasm32-unknown-unknown has no libc; the rust/typescript scanners call
/// iswspace/iswalpha/iswdigit (and possibly siblings, kept for debug
/// builds that retain more code paths). Rust char methods match C
/// semantics for the ASCII-range code points the scanners actually test.

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn iswspace(c: u32) -> i32 {
    i32::from(char::from_u32(c).is_some_and(|ch| ch.is_whitespace()))
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn iswalpha(c: u32) -> i32 {
    i32::from(char::from_u32(c).is_some_and(|ch| ch.is_alphabetic()))
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn iswdigit(c: u32) -> i32 {
    i32::from(char::from_u32(c).is_some_and(|ch| ch.is_ascii_digit()))
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn iswalnum(c: u32) -> i32 {
    i32::from(char::from_u32(c).is_some_and(|ch| ch.is_alphanumeric()))
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn iswupper(c: u32) -> i32 {
    i32::from(char::from_u32(c).is_some_and(|ch| ch.is_uppercase()))
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn iswlower(c: u32) -> i32 {
    i32::from(char::from_u32(c).is_some_and(|ch| ch.is_lowercase()))
}

// Backing allocator for the vendored tree-sitter-language wasm stdlib.c
// (hybrid design): C malloc/free forward NEW blocks to dlmalloc through these
// exports; freed blocks are retained in a C-side free list (see vendor patch).
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn ts_c_alloc(size: usize) -> *mut u8 {
    let layout = std::alloc::Layout::from_size_align(size.max(1), 8).expect("bad layout");
    unsafe { std::alloc::alloc(layout) }
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn ts_c_dealloc(ptr: *mut u8, size: usize) {
    let layout = std::alloc::Layout::from_size_align(size.max(1), 8).expect("bad layout");
    unsafe { std::alloc::dealloc(ptr, layout) }
}
