import { create } from 'zustand'
import type { AstNode, ParseResult, ParseStats } from '../lib/ast'

export interface ParseState {
  status: 'idle' | 'parsing' | 'error'
  stats: ParseStats | null
  ast: AstNode | null
  errorMessage: string | null
  lastSourceHash: string | null
  parseRequested: () => void
  parseResolved: (result: ParseResult) => void
  parseFailed: (message: string) => void
}

export const useParseStore = create<ParseState>((set, get) => ({
  status: 'idle',
  stats: null,
  ast: null,
  errorMessage: null,
  lastSourceHash: null,
  parseRequested: () => set({ status: 'parsing' }),
  parseResolved: (result: ParseResult) => {
    if (result.sourceHash === get().lastSourceHash) {
      return
    }
    set({
      status: 'idle',
      stats: result.stats,
      ast: result.ast,
      lastSourceHash: result.sourceHash,
      errorMessage: null,
    })
  },
  parseFailed: (message: string) => {
    set({
      status: 'error',
      errorMessage: message,
    })
  },
}))
