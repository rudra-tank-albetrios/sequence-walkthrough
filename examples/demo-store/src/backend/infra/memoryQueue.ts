// Mail Queue stand-in: first in, first out.

export class MemoryQueue<T> {
  private readonly jobs: T[] = [];

  enqueue(job: T): void {
    this.jobs.push(job);
  }

  dequeue(): T | undefined {
    return this.jobs.shift();
  }

  get size(): number {
    return this.jobs.length;
  }
}
