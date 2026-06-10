/**
 * tcp/framing.ts
 * ISO 8583 TCP framing – 2-byte big-endian length header.
 *
 * TCP is a stream protocol: a single `socket.on('data')` event may deliver
 * a partial message, an exact message, or several messages concatenated.
 * This module provides a stateful `IsoFramer` class that accumulates incoming
 * bytes and emits one callback per complete ISO 8583 message body.
 *
 * Wire format:
 *   ┌─────────────────┬──────────────────────────────┐
 *   │ Length  2 bytes │  Message body  `length` bytes │
 *   │ Big-endian      │  (MTI + bitmap + fields)      │
 *   └─────────────────┴──────────────────────────────┘
 *
 * The length field encodes the byte count of the message body only
 * (i.e. it does NOT include the 2-byte length header itself).
 */
import { EventEmitter } from 'node:events'

/** Maximum reasonable ISO 8583 message size. Rejects malformed length headers. */
const MAX_MESSAGE_BYTES = 65_535

/**
 * Stateful framer for a single TCP connection.
 *
 * Usage:
 * ```ts
 * const framer = new IsoFramer()
 * framer.on('message', (body: Buffer) => { … })
 * framer.on('error',   (err: Error)  => { … })
 *
 * socket.on('data', (chunk) => framer.push(chunk))
 * ```
 */
export class IsoFramer extends EventEmitter {
  private _buf = Buffer.alloc(0)

  /** Feed raw TCP data into the framer. */
  push(chunk: Buffer): void {
    this._buf = Buffer.concat([this._buf, chunk])
    this._drain()
  }

  /** Reset internal state (e.g. after a connection reset). */
  reset(): void {
    this._buf = Buffer.alloc(0)
  }

  private _drain(): void {
    while (true) {
      // Need at least 2 bytes for the length header
      if (this._buf.length < 2) break

      const bodyLen = this._buf.readUInt16BE(0)

      if (bodyLen === 0 || bodyLen > MAX_MESSAGE_BYTES) {
        this.emit('error', new Error(
          `ISO framing: invalid length header value ${bodyLen} (max ${MAX_MESSAGE_BYTES})`
        ))
        this.reset()
        break
      }

      // Need header (2) + body (bodyLen) bytes
      if (this._buf.length < 2 + bodyLen) break

      // Extract one complete message body (without the length header)
      const body = Buffer.from(this._buf.subarray(2, 2 + bodyLen))

      // Advance the internal buffer
      this._buf = Buffer.from(this._buf.subarray(2 + bodyLen))

      // Emit the complete message body
      this.emit('message', body)
    }
  }
}

/**
 * Wrap a message body buffer with a 2-byte big-endian length header.
 * Use this when constructing outbound messages without going through
 * the full `encodeWithLengthHeader` codec path.
 */
export function wrapWithLengthHeader(body: Buffer): Buffer {
  const header = Buffer.alloc(2)
  header.writeUInt16BE(body.length, 0)
  return Buffer.concat([header, body])
}
