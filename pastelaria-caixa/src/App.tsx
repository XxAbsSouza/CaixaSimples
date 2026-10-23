import { useState } from "react";
import Caixa from "./pages/Caixa";
import Clientes from "./pages/Clientes";
import Produtos from "./pages/Produtos";
import Historico from "./pages/Historico";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import ControleGeral from "./pages/ControleGeral";

const tabs = [
  ["caixa", "🛒", "Caixa"],
  ["clientes", "👤", "Clientes"],
  ["produtos", "🥟", "Produtos"],
  ["historico", "🧾", "Histórico"],
  ["controle", "📊", "Controle"],
] as const;

type Tab = (typeof tabs)[number][0];

export default function App() {
  const [tab, setTab] = useState<Tab>("caixa");
  const [customerId, setCustomerId] = useState<string | null>(null);

  const openCustomer = (id: string) => setCustomerId(id);
  const closeCustomer = () => setCustomerId(null);

  if (customerId) {
    return (
      <div className="flex h-dvh w-full flex-col bg-orange-50">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <ClienteDetalhe customerId={customerId} onBack={closeCustomer} />
        </main>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full flex-col bg-orange-50">
      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === "caixa" && (
          <Caixa active={tab === "caixa"} onOpenCustomer={openCustomer} />
        )}
        {tab === "clientes" && <Clientes />}
        {tab === "produtos" && <Produtos />}
        {tab === "historico" && <Historico />}
        {tab === "controle" && <ControleGeral />}
      </main>

      <nav className="grid grid-cols-5 border-t border-orange-100 bg-white/95 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(234,88,12,0.08)] backdrop-blur">
        {tabs.map(([key, icon, label]) => {
          const isActive = tab === key;

          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex flex-col items-center gap-0.5 py-1 text-[11px] transition-colors"
            >
              <span
                className={`flex h-8 w-14 items-center justify-center rounded-full text-xl transition-all ${
                  isActive ? "bg-orange-100" : "bg-transparent"
                }`}
              >
                {icon}
              </span>

              <span
                className={
                  isActive
                    ? "font-bold text-orange-600"
                    : "font-medium text-gray-500"
                }
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
