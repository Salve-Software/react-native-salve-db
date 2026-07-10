declare const _brand: unique symbol;

/** Opaque `where` condition. Only constructable via operator functions (`eq`, `and`, `or`, ...). */
export type Condition = { readonly [_brand]: true };
