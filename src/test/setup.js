import '@testing-library/jest-dom/vitest'

// jsdom does not implement scrolling and reports every call as an error.
window.scrollTo = () => {}

// jsdom has no IntersectionObserver, which Motion's "when in view" animations (the meter bars)
// need. This one never reports an element as visible, so those animations simply stay at rest.
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
