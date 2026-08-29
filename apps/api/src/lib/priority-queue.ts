/**
 * Binary Min-Heap Priority Queue.
 *
 * DSA: O(log n) enqueue/dequeue. Lower priority number = higher urgency.
 * Used by the media worker to process URGENT complaints before LOW ones.
 */
export class PriorityQueue<T> {
  private heap: { priority: number; value: T }[] = [];

  get length(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  enqueue(value: T, priority: number): void {
    this.heap.push({ priority, value });
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0]!.value;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  peek(): T | undefined {
    return this.heap[0]?.value;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >>> 1;
      if (this.heap[parent]!.priority <= this.heap[i]!.priority) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i]!, this.heap[parent]!];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.heap[left]!.priority < this.heap[smallest]!.priority) smallest = left;
      if (right < n && this.heap[right]!.priority < this.heap[smallest]!.priority) smallest = right;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i]!, this.heap[smallest]!];
      i = smallest;
    }
  }
}

/** Map complaint Priority enum to numeric urgency (lower = more urgent). */
export const PRIORITY_WEIGHT: Record<string, number> = {
  URGENT: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};
