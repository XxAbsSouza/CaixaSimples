export const brl = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const toNum = (s: string) => Number(s.replace(/\./g, '').replace(',', '.')) || 0
export const r2 = (n: number) => Math.round(n * 100) / 100
export const byName = <T extends { name: string }>(a: T[]) => [...a].sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'))
export const today = () => {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10)
}
