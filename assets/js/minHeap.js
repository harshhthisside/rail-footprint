// ==========================================
// Rail Footprint
// Binary Min Heap (parallel arrays — less GC)
// ==========================================

export class MinHeap {
    constructor() {
        this.nodes = [];
        this.prios = [];
    }

    size() {
        return this.nodes.length;
    }

    isEmpty() {
        return this.nodes.length === 0;
    }

    push(node, priority) {
        this.nodes.push(node);
        this.prios.push(priority);
        this.bubbleUp(this.nodes.length - 1);
    }

    pop() {
        const n = this.nodes.length;
        if (n === 0) return null;
        const rootNode = this.nodes[0];
        const rootPrio = this.prios[0];
        if (n === 1) {
            this.nodes.pop();
            this.prios.pop();
            return { node: rootNode, priority: rootPrio };
        }
        this.nodes[0] = this.nodes.pop();
        this.prios[0] = this.prios.pop();
        this.bubbleDown(0);
        return { node: rootNode, priority: rootPrio };
    }

    bubbleUp(index) {
        const nodes = this.nodes;
        const prios = this.prios;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (prios[parent] <= prios[index]) break;
            // swap
            let t = nodes[parent]; nodes[parent] = nodes[index]; nodes[index] = t;
            t = prios[parent]; prios[parent] = prios[index]; prios[index] = t;
            index = parent;
        }
    }

    bubbleDown(index) {
        const nodes = this.nodes;
        const prios = this.prios;
        const length = nodes.length;
        while (true) {
            const left = index * 2 + 1;
            const right = left + 1;
            let smallest = index;
            if (left < length && prios[left] < prios[smallest]) smallest = left;
            if (right < length && prios[right] < prios[smallest]) smallest = right;
            if (smallest === index) break;
            let t = nodes[index]; nodes[index] = nodes[smallest]; nodes[smallest] = t;
            t = prios[index]; prios[index] = prios[smallest]; prios[smallest] = t;
            index = smallest;
        }
    }
}
