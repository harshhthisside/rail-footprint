// ==========================================
// Rail Footprint
// Binary Min Heap
// ==========================================

export class MinHeap {

    constructor() {
        this.heap = [];
    }

    size() {
        return this.heap.length;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    push(node, priority) {

        const item = {
            node,
            priority
        };

        this.heap.push(item);

        this.bubbleUp(this.heap.length - 1);

    }

    pop() {

        if (this.heap.length === 1)
            return this.heap.pop();

        const root = this.heap[0];

        this.heap[0] = this.heap.pop();

        this.bubbleDown(0);

        return root;

    }

    bubbleUp(index) {

        while (index > 0) {

            const parent = Math.floor((index - 1) / 2);

            if (this.heap[parent].priority <= this.heap[index].priority)
                break;

            [this.heap[parent], this.heap[index]] =
                [this.heap[index], this.heap[parent]];

            index = parent;

        }

    }

    bubbleDown(index) {

        const length = this.heap.length;

        while (true) {

            let left = index * 2 + 1;
            let right = index * 2 + 2;
            let smallest = index;

            if (
                left < length &&
                this.heap[left].priority <
                this.heap[smallest].priority
            ) {
                smallest = left;
            }

            if (
                right < length &&
                this.heap[right].priority <
                this.heap[smallest].priority
            ) {
                smallest = right;
            }

            if (smallest === index)
                break;

            [this.heap[index], this.heap[smallest]] =
                [this.heap[smallest], this.heap[index]];

            index = smallest;

        }

    }

}