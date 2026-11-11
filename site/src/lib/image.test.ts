import { describe, expect, it } from 'vitest'
import { dataUrlBytes, fitWidth } from './image'

describe('image helpers', () => {
  it('never upscales and caps width at 1400 keeping the aspect ratio', () => {
    expect(fitWidth(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWidth(2800, 2100)).toEqual({ width: 1400, height: 1050 })
  })
  it('measures the bytes inside a base64 data URL', () => {
    expect(dataUrlBytes('data:image/webp;base64,' + 'A'.repeat(400))).toBe(300)
  })
})
