import { describe, expect, it } from 'vitest'
import { parseAppOrigins } from '../lib/app-origins.js'

describe('parseAppOrigins', () => {
  it('reads one origin', () => {
    expect(parseAppOrigins('https://app.example.com')).toEqual(['https://app.example.com'])
  })

  it('reads a comma-separated list, trimming spaces and dropping blanks', () => {
    expect(parseAppOrigins(' https://a.example.com, ,https://b.example.com ,')).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ])
  })

  it('reads nothing from an unset or empty value', () => {
    expect(parseAppOrigins(undefined)).toEqual([])
    expect(parseAppOrigins('')).toEqual([])
  })
})
