import { afterEach, describe, expect, it } from 'vitest'
import { inviteCodeFrom, inviteLink, takeInviteFromUrl } from './invite.ts'

afterEach(() => window.history.replaceState(null, '', '/'))

describe('invite links', () => {
  it('are this app with the code as a parameter', () => {
    expect(inviteLink('abc_-1')).toBe(`${window.location.origin}/?invite=abc_-1`)
  })

  it('give their code once and leave the rest of the address alone', () => {
    window.history.replaceState(null, '', '/?invite=abc&lang=en#top')

    expect(takeInviteFromUrl()).toBe('abc')
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe('/?lang=en#top')
    expect(takeInviteFromUrl()).toBeNull()
  })

  it('give no code for an address without one', () => {
    window.history.replaceState(null, '', '/?invite=')

    expect(takeInviteFromUrl()).toBeNull()
    expect(window.location.search).toBe('')
  })

  it.each([
    ['a pasted link', 'https://app.example/?invite=abc', 'abc'],
    ['a code with spaces around it', '  abc  ', 'abc'],
    ['a link without a code', 'https://app.example/', 'https://app.example/'],
  ])('read the code from %s', (_name, value, code) => {
    expect(inviteCodeFrom(value)).toBe(code)
  })
})
