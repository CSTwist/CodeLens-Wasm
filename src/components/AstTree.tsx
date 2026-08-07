import { useState, useMemo, useCallback, useRef, useEffect, type KeyboardEvent } from 'react'
import type { AstNode } from '../lib/ast'

interface AstTreeProps {
  ast: AstNode | null
  onNodeClick?: (node: AstNode) => void
  selectedNodePath?: AstNode[]
}

interface FlattenedItem {
  node: AstNode
  depth: number
  hasChildren: boolean
  isExpanded: boolean
  id: string
}

export function AstTree({ ast, onNodeClick, selectedNodePath }: AstTreeProps) {
  const [showAnonymous, setShowAnonymous] = useState(false)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<AstNode>>(new Set())
  const [manuallyExpandedNodes, setManuallyExpandedNodes] = useState<Set<AstNode>>(new Set())
  const [focusedIndex, setFocusedIndex] = useState<number>(0)
  const treeContainerRef = useRef<HTMLDivElement>(null)

  // Expand ancestors when selectedNodePath changes
  useEffect(() => {
    if (selectedNodePath && selectedNodePath.length > 0) {
      setManuallyExpandedNodes((prev) => {
        const next = new Set(prev)
        selectedNodePath.forEach((node) => next.add(node))
        return next
      })
      setCollapsedNodes((prev) => {
        const next = new Set(prev)
        selectedNodePath.forEach((node) => next.delete(node))
        return next
      })
    }
  }, [selectedNodePath])

  const selectedTargetNode = selectedNodePath && selectedNodePath.length > 0
    ? selectedNodePath[selectedNodePath.length - 1]
    : null

  const toggleCollapse = useCallback((node: AstNode, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setCollapsedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(node)) {
        next.delete(node)
      } else {
        next.add(node)
      }
      return next
    })
    setManuallyExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(node)) {
        next.delete(node)
      } else {
        next.add(node)
      }
      return next
    })
  }, [])

  // Build visible flat list for keyboard navigation and rendering
  const visibleItems = useMemo(() => {
    if (!ast) return []
    const items: FlattenedItem[] = []
    let idCounter = 0

    function walk(node: AstNode, depth: number) {
      if (!showAnonymous && !node.named && !node.error) {
        return
      }

      const filteredChildren = (node.children || []).filter(
        (c) => showAnonymous || c.named || c.error
      )
      const hasChildren = filteredChildren.length > 0

      // Default expand depth < 8 unless collapsed explicitly
      const defaultExpanded = depth < 8
      const isExpanded = manuallyExpandedNodes.has(node)
        ? true
        : collapsedNodes.has(node)
          ? false
          : defaultExpanded

      items.push({
        node,
        depth,
        hasChildren,
        isExpanded,
        id: `node-${idCounter++}`,
      })

      if (hasChildren && isExpanded) {
        for (const child of filteredChildren) {
          walk(child, depth + 1)
        }
      }
    }

    walk(ast, 0)
    return items
  }, [ast, showAnonymous, collapsedNodes, manuallyExpandedNodes])

  // Sync focusedIndex with selectedTargetNode if selected from editor
  useEffect(() => {
    if (selectedTargetNode) {
      const idx = visibleItems.findIndex((item) => item.node === selectedTargetNode)
      if (idx >= 0) {
        setFocusedIndex(idx)
      }
    }
  }, [selectedTargetNode, visibleItems])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (visibleItems.length === 0) return

    const currentItem = visibleItems[focusedIndex]
    if (!currentItem) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex((prev) => Math.min(prev + 1, visibleItems.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'ArrowRight':
        e.preventDefault()
        if (currentItem.hasChildren && !currentItem.isExpanded) {
          toggleCollapse(currentItem.node)
        } else if (currentItem.hasChildren && currentItem.isExpanded) {
          setFocusedIndex((prev) => Math.min(prev + 1, visibleItems.length - 1))
        }
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (currentItem.hasChildren && currentItem.isExpanded) {
          toggleCollapse(currentItem.node)
        } else if (currentItem.depth > 0) {
          // Move focus to parent
          for (let i = focusedIndex - 1; i >= 0; i--) {
            if (visibleItems[i].depth < currentItem.depth) {
              setFocusedIndex(i)
              break
            }
          }
        }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (onNodeClick) {
          onNodeClick(currentItem.node)
        }
        break
    }
  }

  if (!ast) {
    return (
      <div className="flex-1 p-4 text-gray-500 text-sm italic bg-gray-900 rounded-lg flex items-center justify-center">
        No AST available
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-950 border-b border-gray-800 text-xs">
        <span className="font-semibold text-gray-300">AST Visualizer</span>
        <button
          onClick={() => setShowAnonymous(!showAnonymous)}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            showAnonymous
              ? 'bg-indigo-600 text-white font-medium'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
          title="Toggle anonymous tokens (punctuation, keywords)"
        >
          {showAnonymous ? 'Tokens: All' : 'Tokens: Named'}
        </button>
      </div>

      {/* Tree Container */}
      <div
        ref={treeContainerRef}
        role="tree"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-auto p-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 select-none"
      >
        {visibleItems.map((item, index) => {
          const { node, depth, hasChildren, isExpanded, id } = item
          const isSelected = selectedTargetNode === node
          const isFocused = index === focusedIndex

          return (
            <div
              key={id}
              role="treeitem"
              aria-expanded={hasChildren ? isExpanded : undefined}
              aria-selected={isSelected}
              tabIndex={isFocused ? 0 : -1}
              style={{ paddingLeft: `${depth * 14}px` }}
              onClick={(e) => {
                e.stopPropagation()
                setFocusedIndex(index)
                if (onNodeClick) onNodeClick(node)
              }}
              className={`group flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-indigo-900/60 text-indigo-100 font-semibold border-l-2 border-indigo-400'
                  : isFocused
                    ? 'bg-gray-800/80 text-gray-100'
                    : 'hover:bg-gray-800/40 text-gray-300'
              }`}
            >
              {/* Collapse/Expand Toggle Icon */}
              {hasChildren ? (
                <button
                  onClick={(e) => toggleCollapse(node, e)}
                  tabIndex={-1}
                  className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-200"
                >
                  {isExpanded ? '▼' : '►'}
                </button>
              ) : (
                <span className="w-4 h-4 inline-block" />
              )}

              {/* Error Marker */}
              {node.error && (
                <span className="text-red-400 font-bold" title="Syntax Error Node">
                  ⚠
                </span>
              )}

              {/* Field Name Label */}
              {node.fieldName && (
                <span className="text-indigo-400 font-medium">{node.fieldName}:</span>
              )}

              {/* Node Type */}
              <span
                className={
                  node.error
                    ? 'text-red-400 font-bold'
                    : node.named
                      ? 'text-emerald-400'
                      : 'text-gray-400 font-normal'
                }
              >
                {node.type}
              </span>

              {/* Node Snippet / Value */}
              {node.text && (
                <span className="text-amber-300/80 truncate max-w-[180px] bg-gray-950/60 px-1 rounded text-[11px]">
                  "{node.text}"
                </span>
              )}

              {/* Source Line Range */}
              <span className="ml-auto text-[10px] text-gray-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                L{node.start.row + 1}:{node.start.column + 1}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
