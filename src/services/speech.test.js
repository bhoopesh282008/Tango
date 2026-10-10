import { announcements, speak, spokenDistance, speechAvailable, stopSpeaking } from './speech'

const progress = (extra = {}) => ({
  alongM: 100,
  offM: 3,
  arrived: false,
  toUpcomingM: 400,
  upcoming: { startM: 500, text: 'Turn left onto Hill Road' },
  floodedAhead: null,
  ...extra,
})

describe('what is said', () => {
  test('a new instruction is announced with its distance, then again when it is close, and not otherwise', () => {
    const said = {}
    expect(announcements(progress(), said)).toEqual(['In 400 metres. Turn left onto Hill Road.'])
    expect(announcements(progress({ toUpcomingM: 350 }), said)).toEqual([])
    expect(announcements(progress({ toUpcomingM: 110 }), said)).toEqual(['Turn left onto Hill Road.'])
    expect(announcements(progress({ toUpcomingM: 60 }), said)).toEqual([])
    // the next instruction starts again
    const next = { startM: 900, text: 'Arrive at Clinic' }
    expect(announcements(progress({ upcoming: next, toUpcomingM: 380 }), said)).toEqual(['In 400 metres. Arrive at Clinic.'])
  })

  test('a flooded stretch is announced once when it is within 400 m, and again only for another one', () => {
    const said = {}
    announcements(progress(), said)
    const far = progress({ floodedAhead: { toM: 900, lengthM: 300, inside: false } })
    expect(announcements(far, said)).toEqual([])
    const near = progress({ toUpcomingM: 390, floodedAhead: { toM: 380, lengthM: 300, inside: false } })
    expect(announcements(near, said)).toEqual(['Flooded stretch ahead in 400 metres, 300 metres long.'])
    expect(announcements({ ...near, alongM: 110, floodedAhead: { toM: 370, lengthM: 300, inside: false } }, said)).toEqual([])
    const inside = progress({ alongM: 480, toUpcomingM: 20, floodedAhead: { toM: 0, lengthM: 300, inside: true } })
    expect(announcements(inside, said)).toContain('You are in a flooded stretch.')
  })

  test('leaving the route is said once, and nothing else is said until back on it', () => {
    const said = {}
    expect(announcements(progress({ offM: 120 }), said)).toEqual(['You are off the route.'])
    expect(announcements(progress({ offM: 150 }), said)).toEqual([])
    expect(announcements(progress({ offM: 5 }), said)).toEqual(['In 400 metres. Turn left onto Hill Road.'])
  })

  test('arrival is said once, and is the only thing said then', () => {
    const said = {}
    expect(announcements(progress({ arrived: true, floodedAhead: { toM: 0, lengthM: 5, inside: true } }), said)).toEqual(['You have arrived.'])
    expect(announcements(progress({ arrived: true }), said)).toEqual([])
  })

  test('nothing is said without a position on the route', () => {
    expect(announcements(null, {})).toEqual([])
  })
})

test('distances are said the way a person says them', () => {
  expect(spokenDistance(42)).toBe('40 metres')
  expect(spokenDistance(4)).toBe('10 metres')
  expect(spokenDistance(380)).toBe('400 metres')
  expect(spokenDistance(990)).toBe('1000 metres')
  expect(spokenDistance(1440)).toBe('1.4 kilometres')
})

describe('the browser voice', () => {
  const original = { synth: window.speechSynthesis, utterance: window.SpeechSynthesisUtterance }
  afterEach(() => {
    window.speechSynthesis = original.synth
    window.SpeechSynthesisUtterance = original.utterance
  })

  test('is unavailable where the browser has none, and then says nothing without failing', () => {
    delete window.speechSynthesis
    expect(speechAvailable()).toBe(false)
    expect(speak('hello')).toBe(false)
    expect(() => stopSpeaking()).not.toThrow()
  })

  test('cuts off what was being said, then says the new thing in English', () => {
    const calls = []
    window.speechSynthesis = { cancel: () => calls.push('cancel'), speak: (u) => calls.push(`speak:${u.text}:${u.lang}`) }
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text
      }
    }
    expect(speak('Turn left')).toBe(true)
    expect(calls).toEqual(['cancel', 'speak:Turn left:en'])
  })
})
