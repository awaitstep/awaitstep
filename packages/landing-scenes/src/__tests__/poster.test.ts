import { describe, expect, it } from 'vitest'
import { REFUND_REVIEW } from '../graph.js'
import { HERO_CAMERA } from '../layout.js'
import { graphPosterSvg } from '../poster.js'

const svg = (title = 'A workflow') =>
  graphPosterSvg({
    graph: REFUND_REVIEW,
    title,
    camera: HERO_CAMERA,
    width: 800,
    height: 500,
    className: 'x',
  })

describe('graphPosterSvg', () => {
  it('draws a card per node with its name and a line per edge', () => {
    const out = svg()
    for (const n of REFUND_REVIEW.nodes) expect(out).toContain(`>${n.name}</text>`)
    expect(out.match(/<polyline/g)).toHaveLength(REFUND_REVIEW.edges.length)
    expect(out).toContain('class="scene-poster x"')
  })

  it('escapes its accessible name', () => {
    expect(svg('Refunds <fast> & "safe"')).toContain(
      'aria-label="Refunds &lt;fast&gt; &amp; &quot;safe&quot;"',
    )
  })

  it('writes no NaN coordinates', () => {
    expect(svg()).not.toContain('NaN')
  })
})
