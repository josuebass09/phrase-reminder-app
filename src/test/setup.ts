import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { forgetReported } from '../activity.ts'
import { setLanguage } from '../language.ts'

afterEach(() => {
  cleanup()
  forgetReported() // Each test is its own day of activity.
  setLanguage('en') // A test that switched to Spanish leaves the next one in English.
  localStorage.clear()
})

// jsdom doesn't implement modal dialogs. This is enough for the editor's open/close flow.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}
