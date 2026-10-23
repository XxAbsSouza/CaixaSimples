import type { Customer, Product } from "./types";

type Cache<T> = {
  data: T;
  timestamp: number;
};

const CACHE_TIME = 60 * 1000; // 60 segundos

let productsCache: Cache<Product[]> | null = null;
let customersCache: Cache<Customer[]> | null = null;

function isValid<T>(cache: Cache<T> | null) {
  if (!cache) return false;

  return Date.now() - cache.timestamp < CACHE_TIME;
}

export function getProductsCache(): Product[] | null {
  return isValid(productsCache) ? productsCache!.data : null;
}

export function setProductsCache(data: Product[]) {
  productsCache = {
    data,
    timestamp: Date.now(),
  };
}

export function getCustomersCache(): Customer[] | null {
  return isValid(customersCache) ? customersCache!.data : null;
}

export function setCustomersCache(data: Customer[]) {
  customersCache = {
    data,
    timestamp: Date.now(),
  };
}

export function clearProductsCache() {
  productsCache = null;
}

export function clearCustomersCache() {
  customersCache = null;
};

import type { CustomerOrder, Payment } from "./types";

type CustomerDetailCache = {
  customerName: string;
  orders: CustomerOrder[];
  payments: Payment[];
  timestamp: number;
};

const CUSTOMER_DETAIL_CACHE_TIME = 60 * 1000; // 60 segundos

const customerDetailCache = new Map<string, CustomerDetailCache>();

export function getCustomerDetailCache(customerId: string) {
  const cache = customerDetailCache.get(customerId);

  if (!cache) {
    return null;
  }

  if (Date.now() - cache.timestamp >= CUSTOMER_DETAIL_CACHE_TIME) {
    customerDetailCache.delete(customerId);
    return null;
  }

  return cache;
}

export function setCustomerDetailCache(
  customerId: string,
  data: {
    customerName: string;
    orders: CustomerOrder[];
    payments: Payment[];
  }
) {
  customerDetailCache.set(customerId, {
    ...data,
    timestamp: Date.now(),
  });
}

export function clearCustomerDetailCache(customerId: string) {
  customerDetailCache.delete(customerId);
};