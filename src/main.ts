import './style.css'
import { computeFutureValue, computeAnnuityWithdrawal, adjustToToday, formatCurrency } from './finance'

function getElementByIdOrThrow<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing element: ${id}`)
  return element as T
}

const appRoot = document.querySelector<HTMLDivElement>('#app')!
appRoot.innerHTML = `
  <div class="container">
    <h1>Retirement Calculator</h1>
    <form id="inputs" class="grid">
      <label>
        <span>Current savings</span>
        <input id="currentSavings" type="number" min="0" step="1000" value="25000" />
      </label>
      <label>
        <span>Monthly contribution</span>
        <input id="monthlyContribution" type="number" min="0" step="100" value="500" />
      </label>
      <label>
        <span>Annual return (%)</span>
        <input id="annualReturnPercent" type="number" step="0.1" value="6.5" />
      </label>
      <label>
        <span>Years to retirement</span>
        <input id="yearsToRetirement" type="number" min="0" step="1" value="30" />
      </label>
      <label>
        <span>Retirement length (years)</span>
        <input id="retirementYears" type="number" min="1" step="1" value="30" />
      </label>
      <label>
        <span>Inflation (%)</span>
        <input id="inflationPercent" type="number" step="0.1" value="2.5" />
      </label>
      <label>
        <span>Currency</span>
        <select id="currency">
          <option value="USD" selected>USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="JPY">JPY</option>
          <option value="INR">INR</option>
        </select>
      </label>
    </form>
    <div class="results">
      <div class="result"><span>Nest egg (nominal)</span><strong id="nestEgg"></strong></div>
      <div class="result"><span>Monthly withdrawal (nominal)</span><strong id="monthlyWithdrawal"></strong></div>
      <div class="result"><span>Monthly withdrawal (today's dollars)</span><strong id="monthlyWithdrawalReal"></strong></div>
    </div>
  </div>
`

function readNumber(id: string): number {
  const input = getElementByIdOrThrow<HTMLInputElement>(id)
  const value = Number(input.value)
  return isFinite(value) ? value : 0
}

function recalc(): void {
  const currentSavings = readNumber('currentSavings')
  const monthlyContribution = readNumber('monthlyContribution')
  const annualReturnPercent = readNumber('annualReturnPercent')
  const yearsToRetirement = readNumber('yearsToRetirement')
  const retirementYears = readNumber('retirementYears')
  const inflationPercent = readNumber('inflationPercent')
  const currency = (getElementByIdOrThrow<HTMLSelectElement>('currency').value || 'USD') as string

  const nestEgg = computeFutureValue({
    currentSavings,
    monthlyContribution,
    annualReturnPercent,
    yearsToRetirement,
  })

  const withdrawal = computeAnnuityWithdrawal(nestEgg, annualReturnPercent, retirementYears)
  const monthlyReal = adjustToToday(withdrawal.monthly, inflationPercent, yearsToRetirement)

  getElementByIdOrThrow<HTMLSpanElement>('nestEgg').textContent = formatCurrency(nestEgg, currency)
  getElementByIdOrThrow<HTMLSpanElement>('monthlyWithdrawal').textContent = formatCurrency(
    withdrawal.monthly,
    currency
  )
  getElementByIdOrThrow<HTMLSpanElement>('monthlyWithdrawalReal').textContent = formatCurrency(
    monthlyReal,
    currency
  )
}

const form = getElementByIdOrThrow<HTMLFormElement>('inputs')
form.addEventListener('input', recalc)
recalc()
