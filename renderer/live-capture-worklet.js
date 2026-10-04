// Receives already-resampled stereo blocks from the renderer and plays them
// back through a ring buffer so IPC jitter never produces audible dropouts.

class LiveCaptureSource extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = Math.max(16384, Math.round(sampleRate * 4));
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.available = 0;
    this.overflows = 0;
    this.underruns = 0;
    this.active = false;

    this.port.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === "push") {
        this.push(message.left, message.right);
      } else if (message.type === "reset") {
        this.writeIndex = 0;
        this.readIndex = 0;
        this.available = 0;
      } else if (message.type === "enable") {
        this.active = Boolean(message.value);
      }
    };
  }

  push(left, right) {
    const frames = Math.min(left.length, right.length);
    if (frames <= 0) return;
    for (let index = 0; index < frames; index += 1) {
      this.left[this.writeIndex] = left[index];
      this.right[this.writeIndex] = right[index];
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
    }
    this.available += frames;
    if (this.available > this.capacity) {
      const dropped = this.available - this.capacity;
      this.readIndex = (this.readIndex + dropped) % this.capacity;
      this.available = this.capacity;
      this.overflows += 1;
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const left = output[0];
    const right = output.length > 1 ? output[1] : output[0];
    if (!this.active) {
      left.fill(0);
      if (right !== left) right.fill(0);
      return true;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (this.available <= 0) {
        left[index] = 0;
        right[index] = 0;
        this.underruns += 1;
        continue;
      }
      left[index] = this.left[this.readIndex];
      right[index] = this.right[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.capacity;
      this.available -= 1;
    }
    return true;
  }
}

registerProcessor("live-capture-source", LiveCaptureSource);
