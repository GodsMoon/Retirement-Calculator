import './style.css'
import { 
  computeRetirementProjection, 
  runMonteCarloSimulation
} from './finance'
import type { 
  RetirementInputs,
  MonthlyProjection 
} from './finance'

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
        <span>Current Age</span>
        <input id="currentAge" type="number" min="18" max="100" step="1" value="42" />
      </label>
      
      <label>
        <span>Retirement Age Target</span>
        <input id="retirementAge" type="number" min="40" max="100" step="1" value="65" />
      </label>
      
      <label>
        <span>Lifespan Assumption (years)</span>
        <input id="lifespan" type="number" min="60" max="120" step="1" value="90" />
      </label>
      
      <label>
        <span>Current Savings Balance</span>
        <input id="currentSavings" type="number" min="0" step="1000" value="1200000" />
      </label>
      
      <label>
        <span>Annual Contributions</span>
        <input id="annualContributions" type="number" min="0" step="1000" value="12000" />
      </label>
      
      <label>
        <span>Annual Return Assumption (%)</span>
        <input id="annualReturn" type="number" step="0.1" min="0" max="20" value="15" />
      </label>
      
      <label>
        <span>Annual Inflation Assumption (%)</span>
        <input id="annualInflation" type="number" step="0.1" min="0" max="10" value="2.5" />
      </label>
      
      <label>
        <span>Desired Annual Retirement Spending (today's dollars)</span>
        <input id="retirementSpending" type="number" min="0" step="1000" value="180000" />
      </label>
    </form>
    
    <div class="results">
      <div class="success-check">
        <h3>Success Probability</h3>
        <div class="success-bar">
          <div class="success-fill" id="successFill"></div>
        </div>
        <div class="success-text" id="successText">Calculating...</div>
      </div>
      
      <div class="key-metrics">
        <div class="metric">
          <span>Nest Egg at Retirement</span>
          <strong id="nestEgg"></strong>
        </div>
        <div class="metric">
          <span>Monthly Withdrawal (today's dollars)</span>
          <strong id="monthlyWithdrawal"></strong>
        </div>
        <div class="metric">
          <span>Years of Retirement</span>
          <strong id="retirementYears"></strong>
        </div>
      </div>
    </div>
    
    <div class="chart-container">
      <h3>Monthly Accumulation Projections</h3>
      <canvas id="projectionChart" width="800" height="400"></canvas>
    </div>
  </div>
`

function readNumber(id: string): number {
  const input = getElementByIdOrThrow<HTMLInputElement>(id)
  const value = Number(input.value)
  return isFinite(value) ? value : 0
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value))
}

function abbreviateNumber(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
  return num.toString()
}

function drawChart(projections: MonthlyProjection[]): void {
  const canvas = getElementByIdOrThrow<HTMLCanvasElement>('projectionChart')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (projections.length === 0) return

  // Find min/max values for scaling
  const values = projections.map(p => p.balance)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue



  // Chart dimensions and margins
  const margin = Math.max(80, Math.max(
    ctx.measureText('$1.2B').width + 20, // Ensure space for largest possible label
    ctx.measureText('Age 100').width + 20  // Ensure space for X-axis labels
  ))
  const chartWidth = canvas.width - margin * 2
  const chartHeight = canvas.height - margin * 2

  // Draw background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)'
  ctx.fillRect(margin, margin, chartWidth, chartHeight)

  // Draw grid lines with pleasant colors
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 10; i++) {
    const y = margin + (i / 10) * chartHeight
    ctx.beginPath()
    ctx.moveTo(margin, y)
    ctx.lineTo(canvas.width - margin, y)
    ctx.stroke()
  }

  // Draw axes with better colors
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(margin, margin)
  ctx.lineTo(margin, canvas.height - margin)
  ctx.lineTo(canvas.width - margin, canvas.height - margin)
  ctx.stroke()

  // Draw projection line with pleasant colors
  ctx.strokeStyle = '#8b5cf6' // Purple
  ctx.lineWidth = 3
  ctx.beginPath()
  
  projections.forEach((projection, index) => {
    const x = margin + (index / (projections.length - 1)) * chartWidth
    const y = canvas.height - margin - ((projection.balance - minValue) / range) * chartHeight
    
    if (index === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })
  
  ctx.stroke()

  // Draw retirement line with better styling
  const retirementIndex = projections.findIndex(p => p.isRetirement)
  if (retirementIndex > 0) {
    const x = margin + (retirementIndex / (projections.length - 1)) * chartWidth
    ctx.strokeStyle = '#ef4444' // Red
    ctx.lineWidth = 3
    ctx.setLineDash([8, 4])
    ctx.beginPath()
    ctx.moveTo(x, margin)
    ctx.lineTo(x, canvas.height - margin)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Add labels with better styling
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'center'
  
  // Draw Y-axis labels
  const yStep = chartHeight / 5
  for (let i = 0; i <= 5; i++) {
    const y = canvas.height - margin - i * yStep
    const value = minValue + (i / 5) * range
    const roundedValue = Math.round(value / 10000) * 10000
    const label = '$' + abbreviateNumber(roundedValue)
    
    ctx.fillStyle = '#666'
    ctx.font = '12px Arial'
    ctx.textAlign = 'right'
    ctx.fillText(label, margin - 10, y + 4) // Position labels within the left margin
    
    // Draw horizontal grid lines
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(margin, y)
    ctx.lineTo(canvas.width - margin, y)
    ctx.stroke()
  }
  
  // X-axis labels showing age
  const startAge = projections[0]?.age || 0
  const endAge = projections[projections.length - 1]?.age || 0
  const ageRange = endAge - startAge
  
  for (let i = 0; i <= 8; i++) {
    const age = startAge + (i / 8) * ageRange
    const x = margin + (i / 8) * chartWidth
    ctx.fillText(Math.round(age).toString(), x, canvas.height - margin / 2)
  }

  // Add chart title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.font = 'bold 16px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('Portfolio Balance Over Time', canvas.width / 2, margin / 2)

  // Add legend above the chart
  const legendY = margin - 20
  ctx.font = '12px Arial'
  ctx.textAlign = 'left'
  
  // Portfolio line legend
  ctx.strokeStyle = '#8b5cf6'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(margin, legendY)
  ctx.lineTo(margin + 30, legendY)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.fillText('Portfolio Balance', margin + 40, legendY + 4)
  
  // Retirement line legend
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 3
  ctx.setLineDash([8, 4])
  ctx.beginPath()
  ctx.moveTo(margin + 200, legendY)
  ctx.lineTo(margin + 230, legendY)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillText('Retirement Start', margin + 240, legendY + 4)

  // Add X-axis label (removed "Years")
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('Age', canvas.width / 2, canvas.height - 10)
}

// Add hover functionality to show values
function setupChartHover(projections: MonthlyProjection[]): void {
  const canvas = getElementByIdOrThrow<HTMLCanvasElement>('projectionChart')
  
  // Remove any existing tooltip
  const existingTooltip = document.getElementById('chartTooltip')
  if (existingTooltip) {
    existingTooltip.remove()
  }
  
  // Create new tooltip
  const tooltip = document.createElement('div')
  tooltip.id = 'chartTooltip'
  tooltip.style.cssText = `
    position: fixed;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    pointer-events: none;
    z-index: 1000;
    display: none;
    white-space: nowrap;
    font-family: Arial, sans-serif;
  `
  document.body.appendChild(tooltip)
  
  // Chart dimensions for coordinate conversion
  const margin = 80
  const chartWidth = canvas.width - margin * 2
  const chartHeight = canvas.height - margin * 2
  
  // Get data range for Y-axis scaling
  const values = projections.map(p => p.balance)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valueRange = maxValue - minValue
  
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    // Check if mouse is within chart bounds
    if (mouseX >= margin && mouseX <= canvas.width - margin && 
        mouseY >= margin && mouseY <= canvas.height - margin) {
      
      // Convert mouse X position to projection index
      const chartX = (mouseX - margin) / chartWidth
      const projectionIndex = Math.round(chartX * (projections.length - 1))
      const projection = projections[Math.max(0, Math.min(projectionIndex, projections.length - 1))]
      
      if (projection) {
        tooltip.innerHTML = `
          <strong>Age: ${Math.round(projection.age)}</strong><br>
          <strong>Balance: $${abbreviateNumber(projection.balance)}</strong><br>
          <em>${projection.isRetirement ? 'Retirement' : 'Accumulation'}</em>
        `
        
        tooltip.style.display = 'block'
        tooltip.style.left = (e.clientX + 10) + 'px'
        tooltip.style.top = (e.clientY - 10) + 'px'
      }
    } else {
      tooltip.style.display = 'none'
    }
  })
  
  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none'
  })
}

function recalc(): void {
  const inputs: RetirementInputs = {
    currentAge: readNumber('currentAge'),
    retirementAge: readNumber('retirementAge'),
    lifespan: readNumber('lifespan'),
    currentSavings: readNumber('currentSavings'),
    annualContributions: readNumber('annualContributions'),
    annualReturn: readNumber('annualReturn'),
    annualInflation: readNumber('annualInflation'),
    retirementSpending: readNumber('retirementSpending')
  }

  // Validate inputs
  if (inputs.retirementAge <= inputs.currentAge) {
    getElementByIdOrThrow<HTMLSpanElement>('successText').textContent = 'Retirement age must be after current age'
    return
  }

  if (inputs.lifespan <= inputs.retirementAge) {
    getElementByIdOrThrow<HTMLSpanElement>('successText').textContent = 'Lifespan must be after retirement age'
    return
  }

  // Calculate deterministic projection
  const projection = computeRetirementProjection(inputs)
  
  // Run Monte Carlo simulation
  const successRate = runMonteCarloSimulation(inputs, 1000)
  
  // Update success probability
  const successFill = getElementByIdOrThrow<HTMLDivElement>('successFill')
  const successText = getElementByIdOrThrow<HTMLSpanElement>('successText')
  
  successFill.style.width = `${successRate}%`
  successFill.style.backgroundColor = successRate >= 80 ? '#10b981' : successRate >= 60 ? '#f59e0b' : '#ef4444'
  successText.textContent = `${successRate.toFixed(1)}% success probability`
  
  // Update key metrics
  getElementByIdOrThrow<HTMLSpanElement>('nestEgg').textContent = formatNumber(projection.nestEgg)
  getElementByIdOrThrow<HTMLSpanElement>('monthlyWithdrawal').textContent = formatNumber(projection.monthlyWithdrawal)
  getElementByIdOrThrow<HTMLSpanElement>('retirementYears').textContent = (inputs.lifespan - inputs.retirementAge).toString()
  
  // Draw chart
  drawChart(projection.monthlyProjections)
  setupChartHover(projection.monthlyProjections)
}

const form = getElementByIdOrThrow<HTMLFormElement>('inputs')
form.addEventListener('input', recalc)
recalc()
