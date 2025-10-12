// Simple counter with HMR demonstration
let count = 0;
const app = document.getElementById("app");

function render() {
  app.innerHTML = `
    <h1>Count: ${count}</h1>
    <button onclick="increment()">Increment</button>
    <p>Edit this file to see HMR in action!</p>
    <p>Current time: ${new Date().toLocaleTimeString()}</p>
  `;
}

function increment() {
  count++;
  console.log(`Counter incremented to: ${count}`);
  if (count % 5 === 0) {
    console.warn(`Counter reached milestone: ${count}`);
  }
  if (count > 10) {
    console.error("Counter is getting too high!");
  }
  render();
}

// Make increment available globally for the onclick
window.increment = increment;

// Initial render
console.info("App started successfully!");
render();

// HMR update handling
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log("🔥 HMR update received!");
    // Re-render to show any changes
    render();
  });
}
