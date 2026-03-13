import SimulatorWrapper from './simulator/SimulatorWrapper';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="header">
        <h1>Simulador de Concurrencia</h1>
        <p>Sistemas Operativos</p>
      </header>
      <main className="main">
        <SimulatorWrapper />
      </main>
    </div>
  );
}

export default App;
