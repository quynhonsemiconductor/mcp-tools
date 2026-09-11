class LinkedListNode {
  key: any;
  type: any;
  data: any;
  prev: LinkedListNode | null;
  next: LinkedListNode | null;
  constructor(key: any, type: any, data: any) {
    this.key = key;
    this.type = type; // 'toggle' or 'envVar'
    this.data = data;
    this.prev = null;
    this.next = null;
  }
}

/**
 * Doubly-linked list used as an intermediate ordering structure.
 * Entries are appended via ordering overrides, then remaining items
 * are appended alphabetically. The final array is generated once at the end.
 */
export class OrderedLinkedList {
  head: LinkedListNode | null;
  tail: LinkedListNode | null;
  _keys: Set<any>; // for quick lookup to avoid duplicates
  constructor() {
    this.head = null;
    this.tail = null;
    this._keys = new Set();
  }

  /** Append a node to the tail of the list */
  append(key: any, type: any, data: any) {
    const node = new LinkedListNode(key, type, data);
    this._keys.add(key);
    if (!this.tail) {
      this.head = node;
      this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }
    return node;
  }

  /** Check if a key is already in the list */
  has(key: any) {
    return this._keys.has(key);
  }

  /** Walk head→tail and return a plain array of { key, type, data } */
  toArray() {
    const result = [];
    let current = this.head;
    while (current) {
      result.push({ key: current.key, type: current.type, data: current.data });
      current = current.next;
    }
    return result;
  }
}
