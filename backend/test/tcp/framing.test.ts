/**
 * test/tcp/framing.test.ts
 * Unit tests for tcp/framing.ts – IsoFramer state machine.
 */
import { IsoFramer, wrapWithLengthHeader } from '../../src/tcp/framing.js'
import { encodeIso8583 } from '../../src/iso/codec.js'
import type { RawIsoMessage } from '../../src/iso/fields.js'

function makeFrame(body: Buffer): Buffer {
  return wrapWithLengthHeader(body)
}

function simpleMsg(stan = '000001'): RawIsoMessage {
  return {
    mti: '0100',
    fields: {
      '011': stan,
      '037': 'RRN000000001',
      '049': '840',
    },
  }
}

describe('IsoFramer', () => {
  it('emits one message when a complete frame arrives in one chunk', (done) => {
    const framer = new IsoFramer()
    const body = encodeIso8583(simpleMsg())
    const frame = makeFrame(body)

    framer.on('message', (received: Buffer) => {
      expect(received).toEqual(body)
      done()
    })

    framer.push(frame)
  })

  it('emits two messages when two frames arrive concatenated', (done) => {
    const framer = new IsoFramer()
    const body1 = encodeIso8583(simpleMsg('000001'))
    const body2 = encodeIso8583(simpleMsg('000002'))
    const combined = Buffer.concat([makeFrame(body1), makeFrame(body2)])

    const received: Buffer[] = []
    framer.on('message', (msg: Buffer) => {
      received.push(msg)
      if (received.length === 2) {
        expect(received[0]).toEqual(body1)
        expect(received[1]).toEqual(body2)
        done()
      }
    })

    framer.push(combined)
  })

  it('reassembles a frame split across two chunks', (done) => {
    const framer = new IsoFramer()
    const body  = encodeIso8583(simpleMsg())
    const frame = makeFrame(body)

    const half1 = frame.subarray(0, Math.floor(frame.length / 2))
    const half2 = frame.subarray(Math.floor(frame.length / 2))

    framer.on('message', (received: Buffer) => {
      expect(received).toEqual(body)
      done()
    })

    framer.push(half1)
    framer.push(half2)
  })

  it('handles byte-by-byte delivery', (done) => {
    const framer = new IsoFramer()
    const body  = encodeIso8583(simpleMsg())
    const frame = makeFrame(body)

    framer.on('message', (received: Buffer) => {
      expect(received).toEqual(body)
      done()
    })

    for (let i = 0; i < frame.length; i++) {
      framer.push(frame.subarray(i, i + 1))
    }
  })

  it('emits error and resets on invalid length header', (done) => {
    const framer = new IsoFramer()
    // Length header of 0 is invalid
    const badFrame = Buffer.from([0x00, 0x00, 0x01, 0x02, 0x03])

    framer.on('error', (err: Error) => {
      expect(err.message).toMatch(/invalid length/)
      done()
    })

    framer.push(badFrame)
  })

  it('reset clears the internal buffer', () => {
    const framer = new IsoFramer()
    const halfFrame = Buffer.from([0x00, 0x10, 0x01, 0x00])  // partial

    const messages: Buffer[] = []
    framer.on('message', (m: Buffer) => messages.push(m))

    framer.push(halfFrame)
    framer.reset()

    // After reset, the partial data is gone; pushing a full frame should work
    const body  = encodeIso8583(simpleMsg())
    const frame = makeFrame(body)
    framer.push(frame)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual(body)
  })
})

describe('wrapWithLengthHeader', () => {
  it('prepends 2-byte big-endian length', () => {
    const body  = Buffer.from('hello', 'ascii')
    const wrapped = wrapWithLengthHeader(body)

    expect(wrapped.length).toBe(7)
    expect(wrapped.readUInt16BE(0)).toBe(5)
    expect(wrapped.subarray(2)).toEqual(body)
  })
})
