export type Customer = {
  id: string;
  name: string;
};

export type ProductCategory =
  | "Pastéis"
  | "Bebidas"
  | "Doces"
  | "Salgados"
  | "SPA"
  | "Brechó"
  | "Outros";

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  "Pastéis",
  "Bebidas",
  "Doces",
  "Salgados",
  "SPA",
  "Brechó",
  "Outros",
];

export type Product = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  category: ProductCategory;
};

export type OrderStatus = "pending" | "paid" | "cancelled";

export type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  products: {
    name: string;
    category: ProductCategory;
  } | null;
};

export type Payment = {
  id: string;
  method: "pix" | "cash";
  amount: number;
  created_at: string;
  order_id: string | null;
};

export type OrderRow = {
  id: string;
  order_number: number;
  created_at: string;
  total: number;
  change_amount: number;
  paid_at: string | null;
  status: OrderStatus;
  customers: {
    name: string;
  } | null;
  order_items: OrderItem[];
  payments: Payment[];
};

export type CustomerPayment = Payment & {
  customers?: {
    name: string;
  } | null;
};

export type CustomerOrder = {
  id: string;
  order_number: number;
  created_at: string;
  total: number;
  change_amount: number;
  paid_at: string | null;
  status: OrderStatus;
  order_items: OrderItem[];
  payments: Payment[];
};
