import React from 'react'
import { GitAuthorAvatar } from '@/components/editor/git-graph/git-author-avatar'
import type { GitHistoryGraphColorId } from '../../../../../../shared/git/history/git-history-types'
import {
  getGitHistoryItemColor,
  getGitHistoryItemLaneIndex,
  type GitHistoryItemViewModel
} from '../../../../../../shared/git/history/git-history-graph'

export const GIT_HISTORY_GRAPH_METRICS = {
  compact: { rowHeight: 24, laneWidth: 11 },
  avatar: { rowHeight: 26, laneWidth: 20 }
} as const
const AVATAR_SIZE = 18
const CIRCLE_RADIUS = 3.5
const CIRCLE_STROKE_WIDTH = 1.5

export function graphColor(color: GitHistoryGraphColorId): string {
  return `var(--${color})`
}

export function gitHistoryNodeColor(viewModel: GitHistoryItemViewModel): GitHistoryGraphColorId {
  return getGitHistoryItemColor(viewModel)
}

function GraphPath({
  d,
  color,
  strokeWidth = 1,
  dashLength
}: {
  d: string
  color: GitHistoryGraphColorId
  strokeWidth?: number
  dashLength?: number
}): React.JSX.Element {
  return (
    <path
      d={d}
      fill="none"
      stroke={graphColor(color)}
      strokeLinecap={dashLength ? 'butt' : 'round'}
      strokeWidth={strokeWidth}
      strokeDasharray={dashLength ? `${dashLength} ${dashLength}` : undefined}
    />
  )
}

export function GitHistoryGraphSvg({
  viewModel,
  visibleWidth,
  variant = 'compact',
  rowHeight = GIT_HISTORY_GRAPH_METRICS[variant].rowHeight,
  laneWidth = GIT_HISTORY_GRAPH_METRICS[variant].laneWidth
}: {
  viewModel: GitHistoryItemViewModel
  visibleWidth?: number
  variant?: 'compact' | 'avatar'
  rowHeight?: number
  laneWidth?: number
}): React.JSX.Element {
  const nodeY = rowHeight / 2
  const curveRadius = laneWidth / 2.2
  const historyItem = viewModel.historyItem
  const inputSwimlanes = viewModel.inputSwimlanes
  const outputSwimlanes = viewModel.outputSwimlanes
  const inputIndex = inputSwimlanes.findIndex((node) => node.id === historyItem.id)
  const circleIndex = getGitHistoryItemLaneIndex(viewModel)
  const circleColor = gitHistoryNodeColor(viewModel)
  const intersects = (left: number, right: number, extent = 0.5): boolean =>
    visibleWidth === undefined || (right + extent >= 0 && left - extent <= visibleWidth)

  // Four dashes per row keep the pattern continuous across row boundaries.
  const dashFor = (node: { dashed?: true } | undefined) =>
    node?.dashed ? rowHeight / 8 : undefined
  const paths: { d: string; color: GitHistoryGraphColorId; dashLength?: number }[] = []
  let outputSwimlaneIndex = 0

  for (let index = 0; index < inputSwimlanes.length; index += 1) {
    const color = inputSwimlanes[index]!.color
    if (inputSwimlanes[index]!.id === historyItem.id) {
      if (
        index !== circleIndex &&
        intersects(
          laneWidth * Math.min(index, circleIndex + 1),
          laneWidth * (index + 1),
          laneWidth + 0.5
        )
      ) {
        paths.push({
          color,
          dashLength: dashFor(inputSwimlanes[index]),
          d: [
            `M ${laneWidth * (index + 1)} 0`,
            `A ${laneWidth} ${laneWidth} 0 0 1 ${laneWidth * index} ${nodeY}`,
            `H ${laneWidth * (circleIndex + 1)}`
          ].join(' ')
        })
      } else if (index === circleIndex && historyItem.parentIds.length > 0) {
        outputSwimlaneIndex += 1
      }
      continue
    }

    if (
      outputSwimlaneIndex < outputSwimlanes.length &&
      inputSwimlanes[index]!.id === outputSwimlanes[outputSwimlaneIndex]!.id
    ) {
      if (
        index === outputSwimlaneIndex &&
        intersects(laneWidth * (index + 1), laneWidth * (index + 1))
      ) {
        paths.push({
          color,
          dashLength: dashFor(inputSwimlanes[index]),
          d: `M ${laneWidth * (index + 1)} 0 V ${rowHeight}`
        })
      } else if (
        index !== outputSwimlaneIndex &&
        intersects(
          laneWidth * Math.min(index + 1, outputSwimlaneIndex + 1),
          laneWidth * Math.max(index + 1, outputSwimlaneIndex + 1),
          curveRadius + 0.5
        )
      ) {
        paths.push({
          color,
          dashLength: dashFor(inputSwimlanes[index]),
          d: [
            `M ${laneWidth * (index + 1)} 0`,
            `V ${nodeY - curveRadius - 1}`,
            `A ${curveRadius} ${curveRadius} 0 0 1 ${
              laneWidth * (index + 1) - curveRadius
            } ${rowHeight / 2}`,
            `H ${laneWidth * (outputSwimlaneIndex + 1) + curveRadius}`,
            `A ${curveRadius} ${curveRadius} 0 0 0 ${
              laneWidth * (outputSwimlaneIndex + 1)
            } ${rowHeight / 2 + curveRadius}`,
            `V ${rowHeight}`
          ].join(' ')
        })
      }
      outputSwimlaneIndex += 1
    }
  }

  const parentOutputIndices =
    historyItem.parentIds.length > 1 ? new Map<string, number>() : undefined
  if (parentOutputIndices) {
    for (let index = 0; index < outputSwimlanes.length; index += 1) {
      parentOutputIndices.set(outputSwimlanes[index]!.id, index)
    }
  }
  for (let index = 1; index < historyItem.parentIds.length; index += 1) {
    const parentId = historyItem.parentIds[index]!
    const parentOutputIndex = parentOutputIndices!.get(parentId)
    if (
      parentOutputIndex === undefined ||
      !intersects(
        laneWidth * Math.min(parentOutputIndex, circleIndex + 1),
        laneWidth * Math.max(parentOutputIndex + 1, circleIndex + 1),
        laneWidth + 0.5
      )
    ) {
      continue
    }
    paths.push({
      color: outputSwimlanes[parentOutputIndex]!.color,
      dashLength: dashFor(outputSwimlanes[parentOutputIndex]),
      d: [
        `M ${laneWidth * parentOutputIndex} ${rowHeight / 2}`,
        `A ${laneWidth} ${laneWidth} 0 0 1 ${laneWidth * (parentOutputIndex + 1)} ${rowHeight}`,
        `M ${laneWidth * parentOutputIndex} ${rowHeight / 2}`,
        `H ${laneWidth * (circleIndex + 1)}`
      ].join(' ')
    })
  }

  const cx = laneWidth * (circleIndex + 1)
  if (inputIndex !== -1 && intersects(cx, cx)) {
    paths.push({
      color: inputSwimlanes[inputIndex]!.color,
      dashLength: dashFor(inputSwimlanes[inputIndex]),
      d: `M ${laneWidth * (circleIndex + 1)} 0 V ${rowHeight / 2}`
    })
  }
  if (historyItem.parentIds.length > 0 && intersects(cx, cx)) {
    paths.push({
      color: circleColor,
      dashLength: viewModel.kind === 'wip' ? rowHeight / 8 : undefined,
      d: `M ${laneWidth * (circleIndex + 1)} ${rowHeight / 2} V ${rowHeight}`
    })
  }

  const cy = nodeY
  const width =
    laneWidth * (Math.max(inputSwimlanes.length, outputSwimlanes.length, circleIndex + 1, 1) + 1)
  const isBoundaryNode =
    viewModel.kind === 'incoming-changes' ||
    viewModel.kind === 'outgoing-changes' ||
    viewModel.kind === 'wip'
  const isMergeNode = historyItem.parentIds.length > 1
  const showAvatar = variant === 'avatar' && !isBoundaryNode
  const circleExtent = showAvatar
    ? AVATAR_SIZE / 2
    : isBoundaryNode || viewModel.kind === 'HEAD'
      ? CIRCLE_RADIUS + 3 + CIRCLE_STROKE_WIDTH / 2
      : isMergeNode
        ? CIRCLE_RADIUS + 1
        : CIRCLE_RADIUS
  const showCircle = intersects(cx, cx, circleExtent)
  const showDot = showCircle && !showAvatar

  const svg = (
    <svg
      aria-hidden="true"
      className="shrink-0 overflow-visible"
      width={width}
      height={rowHeight}
      viewBox={`0 0 ${width} ${rowHeight}`}
    >
      {paths.map((path) => (
        <GraphPath key={path.d} {...path} />
      ))}
      {showDot && viewModel.kind === 'HEAD' && (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={CIRCLE_RADIUS + 3}
            fill={graphColor(circleColor)}
            stroke="var(--background)"
            strokeWidth={CIRCLE_STROKE_WIDTH}
          />
          <circle cx={cx} cy={cy} r={CIRCLE_STROKE_WIDTH} fill="var(--background)" />
        </>
      )}
      {showCircle && isBoundaryNode && (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={CIRCLE_RADIUS + 3}
            fill={graphColor(circleColor)}
            stroke="var(--background)"
            strokeWidth={CIRCLE_STROKE_WIDTH}
          />
          <circle
            cx={cx}
            cy={cy}
            r={CIRCLE_RADIUS + 1}
            fill="var(--background)"
            stroke="var(--background)"
            strokeWidth={CIRCLE_STROKE_WIDTH + 1}
          />
          <circle
            cx={cx}
            cy={cy}
            r={CIRCLE_RADIUS + 1}
            fill="none"
            stroke={graphColor(circleColor)}
            strokeDasharray="4 2"
            strokeWidth={CIRCLE_STROKE_WIDTH - 1}
          />
        </>
      )}
      {showDot && !isBoundaryNode && viewModel.kind !== 'HEAD' && isMergeNode && (
        <>
          <circle cx={cx} cy={cy} r={CIRCLE_RADIUS + 1} fill={graphColor(circleColor)} />
          <circle cx={cx} cy={cy} r={CIRCLE_RADIUS - 1.5} fill="var(--background)" />
        </>
      )}
      {showDot && !isBoundaryNode && viewModel.kind !== 'HEAD' && !isMergeNode && (
        <circle cx={cx} cy={cy} r={CIRCLE_RADIUS} fill={graphColor(circleColor)} />
      )}
    </svg>
  )
  if (!showAvatar) {
    return svg
  }
  return (
    <div className="relative flex shrink-0" style={{ width, height: rowHeight }}>
      {svg}
      {showCircle && (
        <div className="absolute" style={{ left: cx - AVATAR_SIZE / 2, top: cy - AVATAR_SIZE / 2 }}>
          <GitAuthorAvatar
            name={historyItem.author}
            email={historyItem.authorEmail}
            size={AVATAR_SIZE}
            ringColor={circleColor}
          />
        </div>
      )}
    </div>
  )
}
