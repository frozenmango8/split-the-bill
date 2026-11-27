import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("missing #app");

app.innerHTML = `<main><h1>Split the bill</h1></main>`;
