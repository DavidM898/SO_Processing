import { useState } from 'react';
import './Calculator.css';

interface CalcState {
  display: string;
  operand1: number | null;
  operator: string | null;
  waitingForOperand: boolean;
}

const INITIAL: CalcState = {
  display: '0',
  operand1: null,
  operator: null,
  waitingForOperand: false,
};

export function Calculator() {
  const [state, setState] = useState<CalcState>(INITIAL);

  const inputDigit = (digit: string) => {
    setState(s => {
      if (s.waitingForOperand) {
        return { ...s, display: digit, waitingForOperand: false };
      }
      const next = s.display === '0' ? digit : s.display + digit;
      return { ...s, display: next.slice(0, 15) };
    });
  };

  const inputDecimal = () => {
    setState(s => {
      if (s.waitingForOperand) {
        return { ...s, display: '0.', waitingForOperand: false };
      }
      if (!s.display.includes('.')) {
        return { ...s, display: s.display + '.' };
      }
      return s;
    });
  };

  const handleOperator = (op: string) => {
    setState(s => {
      const current = parseFloat(s.display);
      if (s.operator && !s.waitingForOperand) {
        const result = compute(s.operand1 ?? current, current, s.operator);
        return {
          display: formatResult(result),
          operand1: result,
          operator: op,
          waitingForOperand: true,
        };
      }
      return { ...s, operand1: current, operator: op, waitingForOperand: true };
    });
  };

  const handleEquals = () => {
    setState(s => {
      if (s.operator === null || s.operand1 === null) return s;
      const current = parseFloat(s.display);
      const result = compute(s.operand1, current, s.operator);
      return {
        display: formatResult(result),
        operand1: null,
        operator: null,
        waitingForOperand: true,
      };
    });
  };

  const handleClear = () => setState(INITIAL);

  const handleToggleSign = () => {
    setState(s => ({
      ...s,
      display: formatResult(parseFloat(s.display) * -1),
    }));
  };

  const handlePercent = () => {
    setState(s => ({
      ...s,
      display: formatResult(parseFloat(s.display) / 100),
    }));
  };

  return (
    <div className="calculator">
      <div className="calc-display">
        <div className="calc-expression">
          {state.operand1 !== null ? `${state.operand1} ${state.operator ?? ''}` : ''}
        </div>
        <div className="calc-result">{state.display}</div>
      </div>

      <div className="calc-buttons">
        <button className="calc-btn btn-fn" onClick={handleClear}>C</button>
        <button className="calc-btn btn-fn" onClick={handleToggleSign}>±</button>
        <button className="calc-btn btn-fn" onClick={handlePercent}>%</button>
        <button className="calc-btn btn-op" onClick={() => handleOperator('÷')}>÷</button>

        <button className="calc-btn" onClick={() => inputDigit('7')}>7</button>
        <button className="calc-btn" onClick={() => inputDigit('8')}>8</button>
        <button className="calc-btn" onClick={() => inputDigit('9')}>9</button>
        <button className="calc-btn btn-op" onClick={() => handleOperator('×')}>×</button>

        <button className="calc-btn" onClick={() => inputDigit('4')}>4</button>
        <button className="calc-btn" onClick={() => inputDigit('5')}>5</button>
        <button className="calc-btn" onClick={() => inputDigit('6')}>6</button>
        <button className="calc-btn btn-op" onClick={() => handleOperator('−')}>−</button>

        <button className="calc-btn" onClick={() => inputDigit('1')}>1</button>
        <button className="calc-btn" onClick={() => inputDigit('2')}>2</button>
        <button className="calc-btn" onClick={() => inputDigit('3')}>3</button>
        <button className="calc-btn btn-op" onClick={() => handleOperator('+')}>+</button>

        <button className="calc-btn btn-zero" onClick={() => inputDigit('0')}>0</button>
        <button className="calc-btn" onClick={inputDecimal}>.</button>
        <button className="calc-btn btn-eq" onClick={handleEquals}>=</button>
      </div>
    </div>
  );
}

function compute(a: number, b: number, op: string): number {
  switch (op) {
    case '+': return a + b;
    case '−': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? 0 : a / b;
    default: return b;
  }
}

function formatResult(n: number): string {
  if (!isFinite(n)) return 'Error';
  const s = String(n);
  return s.length > 15 ? parseFloat(n.toPrecision(10)).toString() : s;
}
