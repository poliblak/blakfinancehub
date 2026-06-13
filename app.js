import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://rhbtzgjhlfkflqeqpcso.supabase.co";
const SUPABASE_KEY = "sb_publishable_RWRWCKvm-uoEQMWQosAuAg_g4-PqU1Z";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const state = {
  user: null,
  categories: [],
  transactions: [],
  period: "month",
  charts: {},
  channel: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
}).format(Number(value || 0));
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const normalize = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

window.addEventListener("DOMContentLoaded", init);

async function init() {
  $("#txDate").value = today();
  $("#fromFilter").value = monthStart();
  $("#toFilter").value = today();
  bindEvents();
  const { data } = await supabase.auth.getSession();
  setSession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => setSession(session));
  renderIcons();
}

function bindEvents() {
  $("#authForm").addEventListener("submit", signIn);
  $("#signupBtn").addEventListener("click", signUp);
  $("#signOutBtn").addEventListener("click", () => supabase.auth.signOut());
  $("#refreshBtn").addEventListener("click", loadData);
  $("#searchInput").addEventListener("input", renderAll);
  $("#typeFilter").addEventListener("change", renderAll);
  $("#categoryFilter").addEventListener("change", renderAll);
  $("#fromFilter").addEventListener("change", renderAll);
  $("#toFilter").addEventListener("change", renderAll);
  $("#transactionForm").addEventListener("submit", saveTransaction);
  $("#categoryForm").addEventListener("submit", saveCategory);
  $("#openCategoryBtn").addEventListener("click", () => $("#categoryDialog").showModal());
  $$("[data-open-transaction]").forEach((button) => {
    button.addEventListener("click", () => openTransaction(button.dataset.openTransaction));
  });
  $$("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });
  $$(".tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tabs button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.period = button.dataset.period;
      renderAll();
    });
  });
}

async function signIn(event) {
  event.preventDefault();
  setAuthStatus("Entrando...");
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setAuthStatus(error ? error.message : "Sesion iniciada");
}

async function signUp() {
  setAuthStatus("Creando cuenta...");
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.href }
  });
  setAuthStatus(error ? error.message : "Cuenta creada. Revisa tu correo si Supabase pide confirmacion.");
}

function setAuthStatus(message) {
  $("#authStatus").textContent = message;
}

async function setSession(session) {
  state.user = session?.user || null;
  $("#authView").classList.toggle("hidden", !!state.user);
  $("#appView").classList.toggle("hidden", !state.user);
  if (!state.user) {
    if (state.channel) supabase.removeChannel(state.channel);
    return;
  }
  await loadData();
  subscribeRealtime();
}

async function loadData() {
  if (!state.user) return;
  const [categories, transactions] = await Promise.all([
    supabase.from("categories").select("*").order("type").order("name"),
    supabase.from("transactions").select("*, categories(name, color, icon)").order("occurred_on", { ascending: false }).order("created_at", { ascending: false })
  ]);
  if (categories.error) return toast(categories.error.message);
  if (transactions.error) return toast(transactions.error.message);
  state.categories = categories.data || [];
  state.transactions = transactions.data || [];
  renderAll();
}

function subscribeRealtime() {
  if (state.channel) supabase.removeChannel(state.channel);
  state.channel = supabase
    .channel(`finance-${state.user.id}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "transactions",
      filter: `user_id=eq.${state.user.id}`
    }, loadData)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "categories"
    }, loadData)
    .subscribe((status) => {
      $("#realtimeState").textContent = status === "SUBSCRIBED" ? "Realtime activo" : "Realtime conectando";
    });
}

function openTransaction(type) {
  $("#transactionType").value = type;
  $("#transactionTitle").textContent = type === "income" ? "Registrar ingreso" : type === "saving" ? "Registrar ahorro" : "Registrar gasto";
  fillTransactionCategories(type);
  $("#transactionDialog").showModal();
}

function fillTransactionCategories(type) {
  const select = $("#txCategory");
  const options = state.categories.filter((cat) => cat.type === type);
  select.innerHTML = options.map((cat) => `<option value="${cat.id}">${cat.name}</option>`).join("");
}

async function saveTransaction(event) {
  event.preventDefault();
  const type = $("#transactionType").value;
  const payload = {
    user_id: state.user.id,
    type,
    title: $("#txTitle").value.trim(),
    amount: Number($("#txAmount").value),
    category_id: $("#txCategory").value,
    occurred_on: $("#txDate").value,
    payment_method: $("#txMethod").value,
    note: $("#txNote").value.trim() || null
  };
  const { error } = await supabase.from("transactions").insert(payload);
  if (error) return toast(error.message);
  $("#transactionForm").reset();
  $("#txDate").value = today();
  $("#transactionDialog").close();
  toast("Transaccion registrada");
  await loadData();
}

async function saveCategory(event) {
  event.preventDefault();
  const payload = {
    user_id: state.user.id,
    type: $("#catType").value,
    name: $("#catName").value.trim(),
    color: $("#catColor").value,
    icon: "tag",
    is_default: false
  };
  const { error } = await supabase.from("categories").insert(payload);
  if (error) return toast(error.message);
  $("#categoryForm").reset();
  $("#catColor").value = "#9af5ef";
  $("#categoryDialog").close();
  toast("Categoria sincronizada");
  await loadData();
}

async function deleteTransaction(id) {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Transaccion eliminada");
  await loadData();
}

function renderAll() {
  renderMetrics();
  renderCharts();
  renderTransactions();
  renderCategories();
  renderInsights();
  renderIcons();
}

function getFilteredTransactions() {
  const search = normalize($("#searchInput").value);
  const type = $("#typeFilter").value;
  const category = $("#categoryFilter").value;
  const from = $("#fromFilter").value;
  const to = $("#toFilter").value;
  return state.transactions.filter((tx) => {
    const text = normalize(`${tx.title} ${tx.note || ""} ${tx.categories?.name || ""} ${tx.payment_method}`);
    return (!search || text.includes(search))
      && (type === "all" || tx.type === type)
      && (category === "all" || tx.category_id === category)
      && (!from || tx.occurred_on >= from)
      && (!to || tx.occurred_on <= to);
  });
}

function getPeriodTransactions() {
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  if (state.period === "quarter") start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  if (state.period === "year") start = new Date(now.getFullYear(), 0, 1);
  const startText = start.toISOString().slice(0, 10);
  return state.transactions.filter((tx) => tx.occurred_on >= startText);
}

function totals(rows = getPeriodTransactions()) {
  return rows.reduce((acc, tx) => {
    acc[tx.type] += Number(tx.amount);
    return acc;
  }, { income: 0, expense: 0, saving: 0 });
}

function renderMetrics() {
  const current = totals();
  const balance = current.income - current.expense - current.saving;
  const savingRate = current.income ? Math.round((current.saving / current.income) * 100) : 0;
  $("#incomeMetric").textContent = money(current.income);
  $("#expenseMetric").textContent = money(current.expense);
  $("#savingMetric").textContent = money(current.saving);
  $("#balanceMetric").textContent = money(balance);
  $("#savingRate").textContent = `${savingRate}% rate`;
  $("#balanceHint").textContent = balance >= 0 ? "Disponible" : "Sobregiro";
  $("#incomeDelta").textContent = `${state.transactions.filter((tx) => tx.type === "income").length} registros`;
  $("#expenseDelta").textContent = `${state.transactions.filter((tx) => tx.type === "expense").length} registros`;
  const expenseRatio = current.income ? Math.round((current.expense / current.income) * 100) : 0;
  const casino = getPeriodTransactions().filter((tx) => tx.categories?.name?.toLowerCase() === "casino").reduce((sum, tx) => sum + Number(tx.amount), 0);
  const casinoRatio = current.income ? Math.round((casino / current.income) * 100) : 0;
  const score = Math.max(0, Math.min(100, 70 + savingRate - Math.max(0, expenseRatio - 55) - casinoRatio));
  $("#scoreValue").textContent = score;
  $("#expenseRatio").textContent = `${expenseRatio}%`;
  $("#casinoRatio").textContent = `${casinoRatio}%`;
  $("#savingScore").textContent = `${savingRate}%`;
  $("#scoreGauge").style.background = `conic-gradient(from 270deg, var(--cyan) 0deg, var(--violet) ${score * 1.15}deg, var(--green) ${score * 1.8}deg, #272930 ${score * 1.8}deg 180deg)`;
}

function renderCharts() {
  const rows = getPeriodTransactions().slice().sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  const byDate = {};
  rows.forEach((tx) => {
    byDate[tx.occurred_on] ||= { income: 0, expense: 0, saving: 0 };
    byDate[tx.occurred_on][tx.type] += Number(tx.amount);
  });
  const labels = Object.keys(byDate);
  makeChart("flowChart", "line", {
    labels,
    datasets: [
      { label: "Ingresos", data: labels.map((d) => byDate[d].income), borderColor: "#9af5ef", backgroundColor: "rgba(154,245,239,.14)", tension: .35, fill: true },
      { label: "Gastos", data: labels.map((d) => byDate[d].expense), borderColor: "#f87171", backgroundColor: "rgba(248,113,113,.1)", tension: .35, fill: true },
      { label: "Ahorros", data: labels.map((d) => byDate[d].saving), borderColor: "#bdfb8a", backgroundColor: "rgba(189,251,138,.1)", tension: .35, fill: true }
    ]
  });

  const expenseByCategory = {};
  getPeriodTransactions().filter((tx) => tx.type === "expense").forEach((tx) => {
    const name = tx.categories?.name || "Sin categoria";
    expenseByCategory[name] = (expenseByCategory[name] || 0) + Number(tx.amount);
  });
  const catLabels = Object.keys(expenseByCategory);
  makeChart("categoryChart", "doughnut", {
    labels: catLabels,
    datasets: [{ data: catLabels.map((name) => expenseByCategory[name]), backgroundColor: ["#9af5ef", "#a78bfa", "#bdfb8a", "#f87171", "#fbbf24", "#67e8f9", "#c084fc"] }]
  });

  const total = totals();
  makeChart("typeChart", "bar", {
    labels: ["Ingresos", "Gastos", "Ahorros"],
    datasets: [{ label: "Monto", data: [total.income, total.expense, total.saving], backgroundColor: ["#9af5ef", "#f87171", "#bdfb8a"], borderRadius: 7 }]
  });
}

function makeChart(id, type, data) {
  if (!window.Chart) {
    drawFallbackChart(id, type, data);
    return;
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#cfd4dc", boxWidth: 10 } } },
    scales: type === "doughnut" ? {} : {
      x: { ticks: { color: "#8f949f" }, grid: { color: "rgba(255,255,255,.05)" } },
      y: { ticks: { color: "#8f949f" }, grid: { color: "rgba(255,255,255,.05)" } }
    }
  };
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart(document.getElementById(id), { type, data, options });
}

function drawFallbackChart(id, type, data) {
  const canvas = document.getElementById(id);
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, rect.width) * dpr;
  canvas.height = 260 * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#8f949f";

  if (type === "doughnut") {
    const values = data.datasets[0].data;
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const colors = data.datasets[0].backgroundColor;
    let start = -Math.PI / 2;
    values.forEach((value, index) => {
      const angle = (value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.strokeStyle = colors[index % colors.length];
      ctx.lineWidth = 34;
      ctx.arc(rect.width / 2, 120, 72, start, start + angle);
      ctx.stroke();
      start += angle;
    });
    data.labels.slice(0, 5).forEach((label, index) => ctx.fillText(label, 12, 212 + index * 16));
    return;
  }

  const padding = 30;
  const width = Math.max(320, rect.width) - padding * 2;
  const height = 185;
  const allValues = data.datasets.flatMap((dataset) => dataset.data);
  const max = Math.max(...allValues, 1);
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  for (let i = 0; i < 4; i++) {
    const y = padding + (height / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + width, y);
    ctx.stroke();
  }

  if (type === "bar") {
    const values = data.datasets[0].data;
    const colors = data.datasets[0].backgroundColor;
    const barWidth = width / Math.max(values.length * 1.8, 1);
    values.forEach((value, index) => {
      const x = padding + index * (width / values.length) + barWidth * .4;
      const barHeight = (value / max) * height;
      ctx.fillStyle = colors[index % colors.length];
      roundRect(ctx, x, padding + height - barHeight, barWidth, barHeight, 7);
      ctx.fill();
      ctx.fillStyle = "#8f949f";
      ctx.fillText(data.labels[index], x, padding + height + 24);
    });
    return;
  }

  data.datasets.forEach((dataset) => {
    ctx.strokeStyle = dataset.borderColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    dataset.data.forEach((value, index) => {
      const x = padding + (data.labels.length <= 1 ? width / 2 : (index / (data.labels.length - 1)) * width);
      const y = padding + height - (value / max) * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function renderTransactions() {
  const categoryFilter = $("#categoryFilter");
  const selected = categoryFilter.value;
  categoryFilter.innerHTML = `<option value="all">Categoria</option>` + state.categories.map((cat) => `<option value="${cat.id}">${cat.name}</option>`).join("");
  categoryFilter.value = selected && [...categoryFilter.options].some((option) => option.value === selected) ? selected : "all";

  const rows = getFilteredTransactions();
  $("#transactionsTable").innerHTML = rows.length ? rows.map((tx) => `
    <tr>
      <td>${tx.occurred_on}</td>
      <td><span class="tx-title"><strong>${escapeHtml(tx.title)}</strong><small>${escapeHtml(tx.note || "Sin nota")}</small></span></td>
      <td><span class="type-badge type-${tx.type}">${labelType(tx.type)}</span></td>
      <td>${escapeHtml(tx.categories?.name || "Sin categoria")}</td>
      <td>${escapeHtml(tx.payment_method)}</td>
      <td class="right">${money(tx.amount)}</td>
      <td class="right"><button class="icon-only" data-delete="${tx.id}" title="Eliminar"><i data-lucide="trash-2"></i></button></td>
    </tr>
  `).join("") : `<tr><td colspan="7">No hay transacciones para estos filtros.</td></tr>`;
  $$("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteTransaction(button.dataset.delete)));
}

function renderCategories() {
  $("#categoryCloud").innerHTML = state.categories.map((cat) => `
    <span class="cat-chip"><span class="cat-dot" style="background:${cat.color}"></span>${escapeHtml(cat.name)} · ${labelType(cat.type)}${cat.is_default ? "" : " · propia"}</span>
  `).join("");
}

function renderInsights() {
  const rows = getPeriodTransactions();
  const total = totals(rows);
  const expenses = rows.filter((tx) => tx.type === "expense");
  const byCategory = {};
  expenses.forEach((tx) => {
    const name = tx.categories?.name || "Sin categoria";
    byCategory[name] = (byCategory[name] || 0) + Number(tx.amount);
  });
  const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
  const savingRate = total.income ? Math.round((total.saving / total.income) * 100) : 0;
  const restaurants = ["restaurantes", "fastfood", "casino", "cigarros"].reduce((sum, name) => sum + (byCategory[findCategoryName(name)] || 0), 0);
  const insights = [
    {
      title: topCategory ? `Mayor gasto: ${topCategory[0]}` : "Aun no hay gastos",
      body: topCategory ? `Esta categoria concentra ${money(topCategory[1])}. Revisa si corresponde a una decision puntual o un patron recurrente.` : "Registra gastos para empezar a detectar patrones."
    },
    {
      title: `Tasa de ahorro ${savingRate}%`,
      body: savingRate >= 20 ? "Tu tasa de ahorro esta en una zona sana para construir reservas." : "Una meta inicial razonable es llevar el ahorro mensual sobre 10% y luego acercarlo a 20%."
    },
    {
      title: "Gastos discrecionales",
      body: restaurants ? `Casino, restaurantes, fastfood y cigarros suman ${money(restaurants)} en el periodo.` : "No aparecen gastos discrecionales sensibles en el periodo filtrado."
    }
  ];
  $("#insightsList").innerHTML = insights.map((item) => `<article class="insight"><strong>${item.title}</strong><p>${item.body}</p></article>`).join("");
}

function findCategoryName(name) {
  const cat = state.categories.find((item) => normalize(item.name) === normalize(name));
  return cat?.name || name;
}

function labelType(type) {
  return { income: "Ingreso", expense: "Gasto", saving: "Ahorro" }[type] || type;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), 3200);
}

function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}
