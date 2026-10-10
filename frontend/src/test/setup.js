import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = globalThis.ResizeObserver || RO
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
window.scrollTo = () => {}
afterEach(() => cleanup())
