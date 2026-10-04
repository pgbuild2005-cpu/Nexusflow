/**
 * NexusFlow Studio - Advanced Visual Workflow Automation Platform
 * Interactive DAG Canvas, Node Graph Engine, Dynamic Inspector, and Real-time Execution Tracker.
 */

// State Management
const state = {
  workflow: {
    id: null,
    name: "Lead Ingestion & Qualification Pipeline",
    description: "",
    trigger_type: "webhook",
    nodes: [],
    edges: [],
    is_active: true
  },
  selectedNodeId: null,
  selectedEdgeId: null,
  zoom: 1.0,
  panX: 0,
  panY: 0,
  isPanning: false,
  panStart: { x: 0, y: 0 },
  draggingNodeId: null,
  dragOffset: { x: 0, y: 0 },
  connectingPort: null, // { nodeId, portType, handle, portElement }
  activeTab: 'editor', // 'editor', 'history', 'templates'
  latestExecution: null,
  selectedStepNodeId: null,
  isDrawerOpen: true
};

// Node Type Definitions & Metadata
const NODE_META = {
  manual_trigger: { title: "Manual Trigger", icon: "ph-hand-tap", color: "amber", category: "trigger" },
  webhook_trigger: { title: "Inbound Webhook", icon: "ph-webhooks-logo", color: "purple", category: "trigger" },
  cron_trigger: { title: "Schedule / Cron", icon: "ph-clock", color: "sky", category: "trigger" },
  event_poll_trigger: { title: "Event Poller", icon: "ph-radioactive", color: "sky", category: "trigger" },
  http_request: { title: "HTTP Request", icon: "ph-globe", color: "emerald", category: "action" },
  data_transform: { title: "Data Transform", icon: "ph-brackets-curly", color: "teal", category: "action" },
  code_execution: { title: "Execute Python Code", icon: "ph-code", color: "blue", category: "action" },
  send_notification: { title: "Send Notification", icon: "ph-paper-plane-tilt", color: "indigo", category: "action" },
  delay_sleep: { title: "Delay / Sleep", icon: "ph-hourglass-medium", color: "amber", category: "action" },
  ai_generate: { title: "AI Intelligence", icon: "ph-brain", color: "pink", category: "action" },
  database_query: { title: "Database Query", icon: "ph-database", color: "cyan", category: "action" },
  condition_if_else: { title: "If / Else Condition", icon: "ph-split-horizontal", color: "fuchsia", category: "condition" },
  parallel_fork_join: { title: "Parallel Fork & Join", icon: "ph-arrows-split", color: "violet", category: "control" },
  sub_workflow_call: { title: "Sub-Workflow Call", icon: "ph-arrows-in-cardinal", color: "rose", category: "control" }
};

// DOM Elements
const canvasViewport = document.getElementById("canvas-viewport");
const nodesContainer = document.getElementById("nodes-container");
const edgesGroup = document.getElementById("edges-group");
const tempEdge = document.getElementById("temp-edge");
const minimapCanvas = document.getElementById("minimap-canvas");

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  initEventListeners();
  await loadInitialWorkflow();
  renderCanvas();
});

// Load Initial Workflow (from DB or default template)
async function loadInitialWorkflow() {
  try {
    const res = await fetch("/api/workflows");
    const data = await res.json();
    if (data.workflows && data.workflows.length > 0) {
      // Load first workflow
      const fullRes = await fetch(`/api/workflows/${data.workflows[0].id}`);
      const fullData = await fullRes.json();
      if (fullData.workflow) {
        state.workflow = fullData.workflow;
      }
    } else {
      // Load templates and instantiate first one
      const tplRes = await fetch("/api/templates");
      const tplData = await tplRes.json();
      if (tplData.templates && tplData.templates.length > 0) {
        const first = tplData.templates[0];
        state.workflow = {
          id: first.id,
          name: first.name,
          description: first.description,
          trigger_type: first.trigger_type,
          nodes: first.nodes,
          edges: first.edges,
          is_active: true
        };
      }
    }
  } catch (e) {
    console.warn("Could not fetch initial workflow from backend, using local defaults.", e);
  }
  updateHeaderUI();
}

function updateHeaderUI() {
  document.getElementById("current-wf-name").textContent = state.workflow.name || "Untitled Flow";
  const badge = document.getElementById("badge-wf-status");
  if (state.workflow.is_active) {
    badge.className = "flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/50";
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Active`;
  } else {
    badge.className = "flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700";
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Paused`;
  }
}

// Canvas & Node Graph Rendering
function renderCanvas() {
  renderNodes();
  renderEdges();
  renderMinimap();
}

function renderNodes() {
  nodesContainer.innerHTML = "";
  
  state.workflow.nodes.forEach(node => {
    const meta = NODE_META[node.type] || { title: node.type, icon: "ph-gear", color: "slate" };
    const isSelected = state.selectedNodeId === node.id;
    
    const nodeEl = document.createElement("div");
    nodeEl.id = `node-${node.id}`;
    nodeEl.className = `workflow-node ${isSelected ? "selected" : ""}`;
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    
    // Header color styling
    const colorClasses = {
      amber: "border-amber-500/30 text-amber-400 bg-amber-500/10",
      purple: "border-purple-500/30 text-purple-400 bg-purple-500/10",
      sky: "border-sky-500/30 text-sky-400 bg-sky-500/10",
      emerald: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
      teal: "border-teal-500/30 text-teal-400 bg-teal-500/10",
      blue: "border-blue-500/30 text-blue-400 bg-blue-500/10",
      indigo: "border-indigo-500/30 text-indigo-400 bg-indigo-500/10",
      pink: "border-pink-500/30 text-pink-400 bg-pink-500/10",
      fuchsia: "border-fuchsia-500/30 text-fuchsia-400 bg-fuchsia-500/10",
      violet: "border-violet-500/30 text-violet-400 bg-violet-500/10",
      rose: "border-rose-500/30 text-rose-400 bg-rose-500/10",
      cyan: "border-cyan-500/30 text-cyan-400 bg-cyan-500/10",
      slate: "border-slate-500/30 text-slate-400 bg-slate-500/10"
    }[meta.color] || "border-slate-500/30 text-slate-400 bg-slate-500/10";

    // Summary description line
    let summaryText = meta.title;
    if (node.type === "http_request" && node.data?.url) {
      summaryText = `${node.data.method || 'GET'} ${node.data.url.replace(/^https?:\/\//, '').split('/')[0]}`;
    } else if (node.type === "condition_if_else") {
      summaryText = `${node.data?.operator || '=='} ${node.data?.right_operand || ''}`;
    } else if (node.type === "send_notification") {
      summaryText = `${node.data?.channel || 'email'} -> ${node.data?.recipient || 'team'}`;
    }

    nodeEl.innerHTML = `
      <!-- Ports -->
      ${node.type !== 'manual_trigger' && node.type !== 'webhook_trigger' && node.type !== 'cron_trigger' ? 
        `<div class="node-port port-input" data-node-id="${node.id}" data-port-type="input" title="Input Port"></div>` : ''}
      
      ${node.type === 'condition_if_else' ? `
        <div class="node-port port-true" data-node-id="${node.id}" data-port-type="output" data-handle="true" title="True Branch Output"></div>
        <div class="node-port port-false" data-node-id="${node.id}" data-port-type="output" data-handle="false" title="False Branch Output"></div>
      ` : `
        <div class="node-port port-output" data-node-id="${node.id}" data-port-type="output" data-handle="output" title="Output Port"></div>
      `}

      <!-- Node Card Content -->
      <div class="p-3">
        <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div class="flex items-center gap-2 overflow-hidden">
            <div class="w-6 h-6 rounded flex items-center justify-center text-xs shrink-0 border ${colorClasses}">
              <i class="ph-bold ${meta.icon}"></i>
            </div>
            <span class="font-bold text-xs text-slate-200 truncate cursor-text" title="Click to inspect">${node.title || meta.title}</span>
          </div>
          <button class="btn-delete-node text-slate-500 hover:text-rose-400 p-0.5 rounded transition" data-node-id="${node.id}" title="Delete Node">
            <i class="ph-bold ph-trash text-xs"></i>
          </button>
        </div>

        <div class="pt-2 flex items-center justify-between text-[11px] text-slate-400">
          <span class="truncate max-w-[170px] font-mono text-[10px] text-slate-400">${summaryText}</span>
          <span class="node-exec-badge text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">IDLE</span>
        </div>
      </div>
    `;

    // Attach Node Interaction Listeners
    attachNodeEventListeners(nodeEl, node);
    nodesContainer.appendChild(nodeEl);
  });
}

function attachNodeEventListeners(nodeEl, node) {
  // Node Selection
  nodeEl.addEventListener("mousedown", (e) => {
    if (e.target.closest(".node-port") || e.target.closest(".btn-delete-node")) return;
    
    e.stopPropagation();
    selectNode(node.id);
    
    // Start Node Dragging
    state.draggingNodeId = node.id;
    state.dragOffset = {
      x: (e.clientX / state.zoom) - node.x,
      y: (e.clientY / state.zoom) - node.y
    };
  });

  // Delete Node Button
  const deleteBtn = nodeEl.querySelector(".btn-delete-node");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteNode(node.id);
    });
  }

  // Port Connection Drag Handlers
  const ports = nodeEl.querySelectorAll(".node-port");
  ports.forEach(port => {
    port.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      const nodeId = port.getAttribute("data-node-id");
      const portType = port.getAttribute("data-port-type");
      const handle = port.getAttribute("data-handle") || "output";
      
      if (portType === "output") {
        state.connectingPort = { nodeId, portType, handle, portElement: port };
        tempEdge.classList.remove("hidden");
        updateTempEdge(e.clientX, e.clientY);
      }
    });

    port.addEventListener("mouseup", (e) => {
      if (state.connectingPort && state.connectingPort.portType === "output") {
        const targetNodeId = port.getAttribute("data-node-id");
        const targetPortType = port.getAttribute("data-port-type");
        
        if (targetPortType === "input" && targetNodeId !== state.connectingPort.nodeId) {
          // Create new edge connection
          addEdge({
            id: `e-${state.connectingPort.nodeId}-${targetNodeId}-${Date.now()}`,
            source: state.connectingPort.nodeId,
            target: targetNodeId,
            sourceHandle: state.connectingPort.handle,
            targetHandle: "input"
          });
        }
      }
    });
  });
}

function renderEdges() {
  edgesGroup.innerHTML = "";
  
  state.workflow.edges.forEach(edge => {
    const srcNode = state.workflow.nodes.find(n => n.id === edge.source);
    const tgtNode = state.workflow.nodes.find(n => n.id === edge.target);
    
    if (!srcNode || !tgtNode) return;

    // Calculate Port Coordinates
    const srcPort = getPortCoordinates(srcNode, "output", edge.sourceHandle);
    const tgtPort = getPortCoordinates(tgtNode, "input", edge.targetHandle);

    const isSelected = state.selectedEdgeId === edge.id;
    const isTrueBranch = edge.sourceHandle === "true";
    const isFalseBranch = edge.sourceHandle === "false";

    // Cubic Bezier Path
    const pathD = calculateBezierPath(srcPort.x, srcPort.y, tgtPort.x, tgtPort.y);

    const edgeG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    edgeG.setAttribute("class", "edge-group");

    const marker = isTrueBranch ? "url(#arrow-true)" : isFalseBranch ? "url(#arrow-false)" : isSelected ? "url(#arrow-active)" : "url(#arrow-default)";

    let edgeClass = "edge-path";
    if (isSelected) edgeClass += " edge-selected";
    if (isTrueBranch) edgeClass += " edge-true";
    if (isFalseBranch) edgeClass += " edge-false";

    // Background wider stroke for easier clicking
    const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hitPath.setAttribute("d", pathD);
    hitPath.setAttribute("stroke", "transparent");
    hitPath.setAttribute("stroke-width", "16");
    hitPath.setAttribute("fill", "none");
    hitPath.style.cursor = "pointer";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("id", `edge-path-${edge.id}`);
    path.setAttribute("d", pathD);
    path.setAttribute("class", edgeClass);
    path.setAttribute("marker-end", marker);

    // Midpoint for Delete / Condition label
    const midX = (srcPort.x + tgtPort.x) / 2;
    const midY = (srcPort.y + tgtPort.y) / 2;

    const labelG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    labelG.setAttribute("transform", `translate(${midX}, ${midY})`);
    labelG.setAttribute("class", "cursor-pointer");

    if (isTrueBranch || isFalseBranch) {
      const badgeRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      badgeRect.setAttribute("x", "-18");
      badgeRect.setAttribute("y", "-9");
      badgeRect.setAttribute("width", "36");
      badgeRect.setAttribute("height", "18");
      badgeRect.setAttribute("rx", "4");
      badgeRect.setAttribute("fill", isTrueBranch ? "#064e3b" : "#4c0519");
      badgeRect.setAttribute("stroke", isTrueBranch ? "#10b981" : "#f43f5e");
      badgeRect.setAttribute("stroke-width", "1");

      const badgeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      badgeText.setAttribute("text-anchor", "middle");
      badgeText.setAttribute("dy", "3.5");
      badgeText.setAttribute("fill", isTrueBranch ? "#34d399" : "#fda4af");
      badgeText.setAttribute("font-size", "9");
      badgeText.setAttribute("font-weight", "bold");
      badgeText.textContent = isTrueBranch ? "TRUE" : "FALSE";

      labelG.appendChild(badgeRect);
      labelG.appendChild(badgeText);
    }

    const clickHandler = (e) => {
      e.stopPropagation();
      selectEdge(edge.id);
    };

    hitPath.addEventListener("click", clickHandler);
    path.addEventListener("click", clickHandler);
    labelG.addEventListener("click", clickHandler);

    edgeG.appendChild(hitPath);
    edgeG.appendChild(path);
    edgeG.appendChild(labelG);
    edgesGroup.appendChild(edgeG);
  });
}

function getPortCoordinates(node, type, handle = "output") {
  const nodeWidth = 250;
  const nodeHeight = 82; // average node height
  
  if (type === "input") {
    return { x: node.x, y: node.y + (nodeHeight / 2) };
  } else {
    if (handle === "true") {
      return { x: node.x + nodeWidth, y: node.y + (nodeHeight * 0.35) };
    } else if (handle === "false") {
      return { x: node.x + nodeWidth, y: node.y + (nodeHeight * 0.65) };
    }
    return { x: node.x + nodeWidth, y: node.y + (nodeHeight / 2) };
  }
}

function calculateBezierPath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1) * 0.55;
  const control1X = x1 + Math.max(dx, 40);
  const control1Y = y1;
  const control2X = x2 - Math.max(dx, 40);
  const control2Y = y2;
  return `M ${x1} ${y1} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${x2} ${y2}`;
}

function updateTempEdge(clientX, clientY) {
  if (!state.connectingPort) return;
  const srcNode = state.workflow.nodes.find(n => n.id === state.connectingPort.nodeId);
  if (!srcNode) return;

  const srcPort = getPortCoordinates(srcNode, "output", state.connectingPort.handle);
  const rect = canvasViewport.getBoundingClientRect();
  const tgtX = (clientX - rect.left - state.panX) / state.zoom;
  const tgtY = (clientY - rect.top - state.panY) / state.zoom;

  const pathD = calculateBezierPath(srcPort.x, srcPort.y, tgtX, tgtY);
  tempEdge.setAttribute("d", pathD);
}

// Minimap Renderer
function renderMinimap() {
  if (!minimapCanvas) return;
  const ctx = minimapCanvas.getContext("2d");
  const w = minimapCanvas.width = minimapCanvas.offsetWidth;
  const h = minimapCanvas.height = minimapCanvas.offsetHeight;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
  ctx.fillRect(0, 0, w, h);

  if (state.workflow.nodes.length === 0) return;

  // Compute bounding box of all nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.workflow.nodes.forEach(n => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + 250);
    maxY = Math.max(maxY, n.y + 100);
  });

  const padding = 100;
  minX -= padding; minY -= padding;
  maxX += padding; maxY += padding;
  const boxW = Math.max(maxX - minX, 600);
  const boxH = Math.max(maxY - minY, 400);

  const scale = Math.min(w / boxW, h / boxH);

  // Draw Edges on Minimap
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  state.workflow.edges.forEach(edge => {
    const s = state.workflow.nodes.find(n => n.id === edge.source);
    const t = state.workflow.nodes.find(n => n.id === edge.target);
    if (s && t) {
      const sx = (s.x + 125 - minX) * scale;
      const sy = (s.y + 40 - minY) * scale;
      const tx = (t.x + 125 - minX) * scale;
      const ty = (t.y + 40 - minY) * scale;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  });

  // Draw Nodes on Minimap
  state.workflow.nodes.forEach(n => {
    const nx = (n.x - minX) * scale;
    const ny = (n.y - minY) * scale;
    const nw = 250 * scale;
    const nh = 80 * scale;
    ctx.fillStyle = n.id === state.selectedNodeId ? "#6366f1" : "#334155";
    ctx.fillRect(nx, ny, nw, nh);
  });
}

// Node & Edge Graph Operations
function addNode(type, x = 200, y = 200) {
  const meta = NODE_META[type] || { title: "New Node" };
  const newNode = {
    id: `node-${type.split('_')[0]}-${Date.now().toString(36).substr(-4)}`,
    type: type,
    title: meta.title,
    x: Math.round(x / 10) * 10,
    y: Math.round(y / 10) * 10,
    data: getDefaultNodeData(type)
  };
  state.workflow.nodes.push(newNode);
  renderCanvas();
  selectNode(newNode.id);
  showToast(`Added ${meta.title}`);
}

function getDefaultNodeData(type) {
  switch (type) {
    case "manual_trigger":
      return { default_payload: "{\n  \"message\": \"Hello from NexusFlow\",\n  \"user_id\": \"USR-9021\"\n}" };
    case "webhook_trigger":
      return { sample_payload: "{\n  \"event\": \"payment_success\",\n  \"amount\": 199.99,\n  \"email\": \"customer@example.com\"\n}" };
    case "cron_trigger":
      return { cron_expression: "*/5 * * * *", interval_seconds: 300 };
    case "http_request":
      return { method: "GET", url: "https://httpbin.org/json", headers: "{\"Content-Type\": \"application/json\"}", retry_count: 2, retry_delay_seconds: 1 };
    case "data_transform":
      return { mode: "expression", code: "return {\n  'transformed': True,\n  'processed_data': input_data\n}", input_mapping: "{{steps.trigger.output}}" };
    case "code_execution":
      return { code: "# Write custom Python code\nresult = {'status': 'processed', 'count': len(input_data) if isinstance(input_data, (list, dict)) else 1}\nreturn result", input_mapping: "" };
    case "condition_if_else":
      return { left_operand: "{{steps.trigger.output.amount}}", operator: ">=", right_operand: "100" };
    case "send_notification":
      return { channel: "slack", recipient: "#alerts", message_template: "Workflow Notification: Step executed successfully!\nPayload: {{input_data}}" };
    case "ai_generate":
      return { prompt: "Analyze the provided input and generate a concise executive summary with action items:\n{{input_data}}" };
    case "delay_sleep":
      return { duration_seconds: 2 };
    case "parallel_fork_join":
      return { description: "Concurrent parallel branch dispatcher" };
    case "sub_workflow_call":
      return { sub_workflow_id: "", input_mapping: "{}" };
    default:
      return {};
  }
}

function deleteNode(nodeId) {
  state.workflow.nodes = state.workflow.nodes.filter(n => n.id !== nodeId);
  state.workflow.edges = state.workflow.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
  if (state.selectedNodeId === nodeId) {
    selectNode(null);
  }
  renderCanvas();
  showToast("Node removed");
}

function addEdge(edge) {
  // Prevent duplicates
  const exists = state.workflow.edges.some(e => 
    e.source === edge.source && e.target === edge.target && e.sourceHandle === edge.sourceHandle
  );
  if (!exists) {
    state.workflow.edges.push(edge);
    renderCanvas();
    showToast("Connection created");
  }
}

function deleteEdge(edgeId) {
  state.workflow.edges = state.workflow.edges.filter(e => e.id !== edgeId);
  if (state.selectedEdgeId === edgeId) selectEdge(null);
  renderCanvas();
  showToast("Connection removed");
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  state.selectedEdgeId = null;
  
  // Highlight node in DOM
  document.querySelectorAll(".workflow-node").forEach(el => el.classList.remove("selected"));
  if (nodeId) {
    const el = document.getElementById(`node-${nodeId}`);
    if (el) el.classList.add("selected");
  }
  
  renderInspector();
  renderEdges();
}

function selectEdge(edgeId) {
  state.selectedEdgeId = edgeId;
  state.selectedNodeId = null;
  renderEdges();
  renderInspector();
}

// Auto-Layout DAG Hierarchy
function autoLayoutDAG() {
  if (state.workflow.nodes.length === 0) return;

  const nodeMap = new Map(state.workflow.nodes.map(n => [n.id, n]));
  const inDegree = new Map(state.workflow.nodes.map(n => [n.id, 0]));
  const adj = new Map(state.workflow.nodes.map(n => [n.id, []]));

  state.workflow.edges.forEach(e => {
    if (inDegree.has(e.target)) inDegree.set(e.target, inDegree.get(e.target) + 1);
    if (adj.has(e.source)) adj.get(e.source).push(e.target);
  });

  // Assign levels / columns via BFS
  const levels = new Map();
  const queue = [];

  state.workflow.nodes.forEach(n => {
    if (inDegree.get(n.id) === 0) {
      levels.set(n.id, 0);
      queue.push(n.id);
    }
  });

  if (queue.length === 0 && state.workflow.nodes.length > 0) {
    queue.push(state.workflow.nodes[0].id);
    levels.set(state.workflow.nodes[0].id, 0);
  }

  while (queue.length > 0) {
    const curr = queue.shift();
    const currLevel = levels.get(curr) || 0;
    
    (adj.get(curr) || []).forEach(nxt => {
      const nxtLevel = levels.get(nxt);
      if (nxtLevel === undefined || nxtLevel < currLevel + 1) {
        levels.set(nxt, currLevel + 1);
        queue.push(nxt);
      }
    });
  }

  // Group nodes by level
  const columns = [];
  state.workflow.nodes.forEach(n => {
    const lvl = levels.get(n.id) || 0;
    if (!columns[lvl]) columns[lvl] = [];
    columns[lvl].push(n);
  });

  // Position nodes
  const startX = 80;
  const colSpacing = 320;
  const rowSpacing = 140;

  columns.forEach((colNodes, colIdx) => {
    const colHeight = colNodes.length * rowSpacing;
    const startY = Math.max(100, 300 - (colHeight / 2));

    colNodes.forEach((node, rowIdx) => {
      node.x = startX + (colIdx * colSpacing);
      node.y = startY + (rowIdx * rowSpacing);
    });
  });

  renderCanvas();
  showToast("Auto-aligned workflow graph");
}

// Right Inspector Panel Form Renderer
function renderInspector() {
  const inspectorFields = document.getElementById("inspector-fields");
  const testBox = document.getElementById("inspector-test-box");
  const titleEl = document.getElementById("inspector-node-title");
  const typeEl = document.getElementById("inspector-node-type");
  const iconEl = document.getElementById("inspector-node-icon");

  if (!state.selectedNodeId) {
    if (state.selectedEdgeId) {
      titleEl.textContent = "Edge Connection";
      typeEl.textContent = state.selectedEdgeId;
      iconEl.innerHTML = `<i class="ph-bold ph-link"></i>`;
      inspectorFields.innerHTML = `
        <div class="p-4 bg-slate-950/60 rounded-lg border border-slate-800 space-y-3 text-xs">
          <div class="text-slate-300 font-semibold">Connection Details</div>
          <div class="text-slate-400 font-mono text-[11px]">${state.selectedEdgeId}</div>
          <button id="btn-inspector-delete-edge" class="w-full py-1.5 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/40 text-xs font-bold transition">
            <i class="ph-bold ph-trash"></i> Delete Connection
          </button>
        </div>
      `;
      document.getElementById("btn-inspector-delete-edge")?.addEventListener("click", () => deleteEdge(state.selectedEdgeId));
      testBox.classList.add("hidden");
      return;
    }

    titleEl.textContent = "Workflow Inspector";
    typeEl.textContent = "No node selected";
    iconEl.innerHTML = `<i class="ph-bold ph-sliders"></i>`;
    inspectorFields.innerHTML = `
      <div class="text-center py-12 text-slate-500 text-xs">
        <i class="ph-duotone ph-cursor-click text-3xl mb-2 block text-slate-600"></i>
        Select any node on the canvas to configure parameters, variables, retries, and test individual steps.
      </div>
    `;
    testBox.classList.add("hidden");
    return;
  }

  const node = state.workflow.nodes.find(n => n.id === state.selectedNodeId);
  if (!node) return;

  const meta = NODE_META[node.type] || { title: node.type, icon: "ph-gear" };
  titleEl.textContent = node.title || meta.title;
  typeEl.textContent = `${node.type} (${node.id})`;
  iconEl.innerHTML = `<i class="ph-bold ${meta.icon}"></i>`;
  testBox.classList.remove("hidden");

  // Get upstream variable pills
  const variablePills = getUpstreamVariablePills(node.id);

  let formHtml = `
    <!-- Title Field -->
    <div>
      <label class="block text-[11px] font-semibold text-slate-300 mb-1">Step Title</label>
      <input type="text" id="inp-node-title" value="${escapeHtml(node.title || '')}" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" />
    </div>
  `;

  // Upstream Variable Completion Helper
  if (variablePills.length > 0) {
    formHtml += `
      <div class="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 space-y-1.5">
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <i class="ph-bold ph-tree-view text-indigo-400"></i> Available Upstream Variables
        </span>
        <div class="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          ${variablePills.map(p => `
            <button class="btn-var-pill text-[10px] font-mono bg-slate-800 hover:bg-indigo-950 hover:text-indigo-300 text-slate-300 px-2 py-0.5 rounded border border-slate-700" data-expr="${p}">
              ${p}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Type-specific field configurations
  if (node.type === "manual_trigger") {
    formHtml += `
      <div>
        <label class="block text-[11px] font-semibold text-slate-300 mb-1">Default Trigger Payload (JSON)</label>
        <textarea id="inp-default-payload" rows="6" class="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-indigo-500">${escapeHtml(typeof node.data?.default_payload === 'string' ? node.data.default_payload : JSON.stringify(node.data?.default_payload, null, 2))}</textarea>
      </div>
    `;
  } else if (node.type === "webhook_trigger") {
    formHtml += `
      <div>
        <label class="block text-[11px] font-semibold text-slate-300 mb-1">Sample Inbound JSON Body</label>
        <textarea id="inp-sample-payload" rows="6" class="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs font-mono text-purple-300 focus:outline-none focus:border-indigo-500">${escapeHtml(node.data?.sample_payload || '')}</textarea>
      </div>
    `;
  } else if (node.type === "cron_trigger") {
    formHtml += `
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Cron Expression</label>
          <input type="text" id="inp-cron-expr" value="${escapeHtml(node.data?.cron_expression || '*/5 * * * *')}" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs font-mono text-slate-100" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Interval (Seconds)</label>
          <input type="number" id="inp-interval-secs" value="${node.data?.interval_seconds || 300}" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100" />
        </div>
      </div>
    `;
  } else if (node.type === "http_request") {
    formHtml += `
      <div class="space-y-3">
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block text-[11px] font-semibold text-slate-300 mb-1">Method</label>
            <select id="inp-http-method" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100">
              ${['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => `<option value="${m}" ${node.data?.method === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="col-span-2">
            <label class="block text-[11px] font-semibold text-slate-300 mb-1">Endpoint URL</label>
            <input type="text" id="inp-http-url" value="${escapeHtml(node.data?.url || '')}" placeholder="https://api.example.com/v1/..." class="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100" />
          </div>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Headers (JSON)</label>
          <textarea id="inp-http-headers" rows="2" class="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs font-mono text-slate-300">${escapeHtml(typeof node.data?.headers === 'string' ? node.data.headers : JSON.stringify(node.data?.headers || {}))}</textarea>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Request Body (JSON / Template)</label>
          <textarea id="inp-http-body" rows="3" class="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs font-mono text-emerald-300">${escapeHtml(node.data?.body || '')}</textarea>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
          <div>
            <label class="block text-[10px] font-semibold text-slate-400 mb-1">Auto Retry Attempts</label>
            <input type="number" id="inp-retry-count" min="0" max="5" value="${node.data?.retry_count || 0}" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-100" />
          </div>
          <div>
            <label class="block text-[10px] font-semibold text-slate-400 mb-1">Backoff Delay (sec)</label>
            <input type="number" id="inp-retry-delay" min="1" max="30" value="${node.data?.retry_delay_seconds || 1}" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-100" />
          </div>
        </div>
      </div>
    `;
  } else if (node.type === "data_transform") {
    formHtml += `
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Input Mapping Expression</label>
          <input type="text" id="inp-input-mapping" value="${escapeHtml(node.data?.input_mapping || '')}" placeholder="{{steps.node_id.output}}" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs font-mono text-indigo-300" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Python Transformation Function</label>
          <textarea id="inp-transform-code" rows="7" class="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs font-mono text-teal-300">${escapeHtml(node.data?.code || 'return input_data')}</textarea>
        </div>
      </div>
    `;
  } else if (node.type === "code_execution") {
    formHtml += `
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Input Mapping</label>
          <input type="text" id="inp-input-mapping" value="${escapeHtml(node.data?.input_mapping || '')}" placeholder="{{steps.node_id.output}}" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs font-mono text-indigo-300" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Python Script Code</label>
          <textarea id="inp-code-body" rows="8" class="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs font-mono text-blue-300">${escapeHtml(node.data?.code || '')}</textarea>
        </div>
      </div>
    `;
  } else if (node.type === "condition_if_else") {
    const op = node.data?.operator || "==";
    formHtml += `
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Left Operand Expression</label>
          <input type="text" id="inp-cond-left" value="${escapeHtml(node.data?.left_operand || '')}" placeholder="{{steps.node_1.output.score}}" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs font-mono text-fuchsia-300" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Operator</label>
          <select id="inp-cond-op" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 font-semibold">
            <option value="==" ${op === '==' ? 'selected' : ''}>== (Equals)</option>
            <option value="!=" ${op === '!=' ? 'selected' : ''}>!= (Not Equals)</option>
            <option value=">=" ${op === '>=' ? 'selected' : ''}>&gt;= (Greater Than or Equal)</option>
            <option value=">" ${op === '>' ? 'selected' : ''}>&gt; (Greater Than)</option>
            <option value="<=" ${op === '<=' ? 'selected' : ''}>&lt;= (Less Than or Equal)</option>
            <option value="<" ${op === '<' ? 'selected' : ''}>&lt; (Less Than)</option>
            <option value="contains" ${op === 'contains' ? 'selected' : ''}>contains</option>
            <option value="starts_with" ${op === 'starts_with' ? 'selected' : ''}>starts with</option>
            <option value="is_empty" ${op === 'is_empty' ? 'selected' : ''}>is empty</option>
            <option value="is_not_empty" ${op === 'is_not_empty' ? 'selected' : ''}>is not empty</option>
            <option value="regex" ${op === 'regex' ? 'selected' : ''}>regex match</option>
          </select>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Right Operand Value</label>
          <input type="text" id="inp-cond-right" value="${escapeHtml(String(node.data?.right_operand || ''))}" placeholder="75" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100" />
        </div>
      </div>
    `;
  } else if (node.type === "send_notification") {
    formHtml += `
      <div class="space-y-3">
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block text-[11px] font-semibold text-slate-300 mb-1">Channel</label>
            <select id="inp-notif-channel" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100">
              <option value="slack" ${node.data?.channel === 'slack' ? 'selected' : ''}>Slack</option>
              <option value="discord" ${node.data?.channel === 'discord' ? 'selected' : ''}>Discord</option>
              <option value="email" ${node.data?.channel === 'email' ? 'selected' : ''}>Email</option>
              <option value="webhook" ${node.data?.channel === 'webhook' ? 'selected' : ''}>Webhook</option>
            </select>
          </div>
          <div class="col-span-2">
            <label class="block text-[11px] font-semibold text-slate-300 mb-1">Recipient / Target</label>
            <input type="text" id="inp-notif-recipient" value="${escapeHtml(node.data?.recipient || '')}" placeholder="#channel or email@domain.com" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100" />
          </div>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">Message Template</label>
          <textarea id="inp-notif-msg" rows="5" class="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs font-mono text-indigo-300">${escapeHtml(node.data?.message_template || '')}</textarea>
        </div>
      </div>
    `;
  } else if (node.type === "ai_generate") {
    formHtml += `
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] font-semibold text-slate-300 mb-1">AI Prompt Template</label>
          <textarea id="inp-ai-prompt" rows="6" class="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs font-mono text-pink-300">${escapeHtml(node.data?.prompt || '')}</textarea>
        </div>
      </div>
    `;
  } else if (node.type === "delay_sleep") {
    formHtml += `
      <div>
        <label class="block text-[11px] font-semibold text-slate-300 mb-1">Duration (Seconds)</label>
        <input type="number" id="inp-delay-duration" min="0.1" max="60" step="0.5" value="${node.data?.duration_seconds || 1}" class="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100" />
      </div>
    `;
  }

  inspectorFields.innerHTML = formHtml;
  attachInspectorFieldListeners(node);
}

function attachInspectorFieldListeners(node) {
  // Title
  document.getElementById("inp-node-title")?.addEventListener("input", (e) => {
    node.title = e.target.value;
    renderCanvas();
  });

  // Default Payload
  document.getElementById("inp-default-payload")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.default_payload = e.target.value;
  });

  // Sample Payload
  document.getElementById("inp-sample-payload")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.sample_payload = e.target.value;
  });

  // Cron
  document.getElementById("inp-cron-expr")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.cron_expression = e.target.value;
  });
  document.getElementById("inp-interval-secs")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.interval_seconds = parseInt(e.target.value) || 300;
  });

  // HTTP
  document.getElementById("inp-http-method")?.addEventListener("change", (e) => {
    node.data = node.data || {};
    node.data.method = e.target.value;
    renderCanvas();
  });
  document.getElementById("inp-http-url")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.url = e.target.value;
    renderCanvas();
  });
  document.getElementById("inp-http-headers")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.headers = e.target.value;
  });
  document.getElementById("inp-http-body")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.body = e.target.value;
  });
  document.getElementById("inp-retry-count")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.retry_count = parseInt(e.target.value) || 0;
  });
  document.getElementById("inp-retry-delay")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.retry_delay_seconds = parseFloat(e.target.value) || 1;
  });

  // Data Transform & Code
  document.getElementById("inp-input-mapping")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.input_mapping = e.target.value;
  });
  document.getElementById("inp-transform-code")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.code = e.target.value;
  });
  document.getElementById("inp-code-body")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.code = e.target.value;
  });

  // Condition
  document.getElementById("inp-cond-left")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.left_operand = e.target.value;
  });
  document.getElementById("inp-cond-op")?.addEventListener("change", (e) => {
    node.data = node.data || {};
    node.data.operator = e.target.value;
    renderCanvas();
  });
  document.getElementById("inp-cond-right")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.right_operand = e.target.value;
    renderCanvas();
  });

  // Notification
  document.getElementById("inp-notif-channel")?.addEventListener("change", (e) => {
    node.data = node.data || {};
    node.data.channel = e.target.value;
    renderCanvas();
  });
  document.getElementById("inp-notif-recipient")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.recipient = e.target.value;
    renderCanvas();
  });
  document.getElementById("inp-notif-msg")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.message_template = e.target.value;
  });

  // AI Prompt
  document.getElementById("inp-ai-prompt")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.prompt = e.target.value;
  });

  // Delay
  document.getElementById("inp-delay-duration")?.addEventListener("input", (e) => {
    node.data = node.data || {};
    node.data.duration_seconds = parseFloat(e.target.value) || 1;
  });

  // Variable Pill Click-to-Insert
  document.querySelectorAll(".btn-var-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      const expr = btn.getAttribute("data-expr");
      const activeInput = document.activeElement;
      if (activeInput && (activeInput.tagName === "INPUT" || activeInput.tagName === "TEXTAREA")) {
        const start = activeInput.selectionStart;
        const end = activeInput.selectionEnd;
        const val = activeInput.value;
        activeInput.value = val.substring(0, start) + expr + val.substring(end);
        activeInput.dispatchEvent(new Event("input"));
        activeInput.focus();
      }
    });
  });
}

function getUpstreamVariablePills(targetNodeId) {
  const pills = [];
  state.workflow.nodes.forEach(n => {
    if (n.id !== targetNodeId) {
      if (n.type.includes("trigger")) {
        pills.push(`{{steps.${n.id}.output}}`);
        pills.push(`{{steps.${n.id}.output.email}}`);
        pills.push(`{{steps.${n.id}.output.score}}`);
        pills.push(`{{steps.${n.id}.output.amount}}`);
      } else {
        pills.push(`{{steps.${n.id}.output}}`);
      }
    }
  });
  return pills.slice(0, 8);
}

// Single Step Live Tester
async function testSingleStep() {
  if (!state.selectedNodeId) return;
  const node = state.workflow.nodes.find(n => n.id === state.selectedNodeId);
  if (!node) return;

  const btn = document.getElementById("btn-test-single-step");
  btn.disabled = true;
  btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> Testing Step...`;

  try {
    const res = await fetch("/api/test-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node: node,
        mock_input: {
          input_data: { score: 85, amount: 250, email: "test@example.com", customer_id: "CUST-99" },
          trigger: { user_id: "USR-101", test: true },
          steps: {}
        }
      })
    });
    const data = await res.json();
    
    // Display result in bottom execution drawer
    openDrawer();
    populateStepTrace([{
      node_id: node.id,
      node_title: `[Single Step Test] ${node.title || node.type}`,
      node_type: node.type,
      status: data.result?.status === 'success' ? 'success' : 'failed',
      duration_ms: data.result?.duration_ms || 10,
      input: data.result?.resolved_config || node.data,
      output: data.result?.output || data.result?.error
    }]);

    selectStepTrace(node.id);
    showToast(`Step test ${data.result?.status === 'success' ? 'succeeded' : 'failed'}`);
  } catch (e) {
    showToast(`Step test error: ${e.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="ph-bold ph-play-circle"></i> Test This Step Alone`;
  }
}

// Execution Engine Trigger & Visual Animations
async function executeWorkflow(customPayload = null) {
  if (state.workflow.nodes.length === 0) {
    showToast("Canvas is empty. Add nodes to execute.", "error");
    return;
  }

  // Save workflow before executing
  await saveWorkflowToBackend();

  const runBtn = document.getElementById("btn-run-wf");
  runBtn.disabled = true;
  runBtn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> Running...`;

  // Reset visual states
  document.querySelectorAll(".workflow-node").forEach(el => {
    el.classList.remove("state-running", "state-success", "state-failed", "state-skipped");
  });
  document.querySelectorAll(".edge-path").forEach(el => {
    el.classList.remove("edge-path-active");
  });

  openDrawer();
  const execStatusBadge = document.getElementById("exec-status-badge");
  execStatusBadge.className = "text-[11px] px-2 py-0.5 rounded-full bg-sky-950 text-sky-400 border border-sky-800 font-mono animate-pulse";
  execStatusBadge.textContent = "EXECUTING DAG...";

  try {
    const res = await fetch(`/api/workflows/${state.workflow.id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: customPayload })
    });
    const data = await res.json();
    
    if (data.success && data.result) {
      state.latestExecution = data.result;
      
      // Fetch full step traces
      const execTraceRes = await fetch(`/api/executions/${data.result.execution_id}`);
      const traceData = await execTraceRes.json();
      
      if (traceData.execution) {
        animateExecutionVisuals(traceData.execution);
      }
    } else {
      showToast(`Execution failed: ${data.error}`, "error");
      execStatusBadge.className = "text-[11px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-400 border border-rose-800 font-mono";
      execStatusBadge.textContent = "FAILED";
    }
  } catch (e) {
    showToast(`Execution error: ${e.message}`, "error");
  } finally {
    runBtn.disabled = false;
    runBtn.innerHTML = `<i class="ph-fill ph-play"></i> Execute Flow`;
  }
}

// Animate Step Progression on Canvas
async function animateExecutionVisuals(execution) {
  const steps = execution.steps || [];
  const execStatusBadge = document.getElementById("exec-status-badge");
  const execDurBadge = document.getElementById("exec-duration-badge");
  
  execDurBadge.textContent = `${execution.duration_ms}ms total`;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nodeEl = document.getElementById(`node-${step.node_id}`);
    
    if (nodeEl) {
      nodeEl.classList.remove("state-running", "state-success", "state-failed", "state-skipped");
      
      if (step.status === "skipped") {
        nodeEl.classList.add("state-skipped");
        nodeEl.querySelector(".node-exec-badge").textContent = "SKIPPED";
        nodeEl.querySelector(".node-exec-badge").className = "node-exec-badge text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-500";
      } else {
        nodeEl.classList.add("state-running");
        nodeEl.querySelector(".node-exec-badge").textContent = "RUNNING";
        nodeEl.querySelector(".node-exec-badge").className = "node-exec-badge text-[9px] font-mono px-1 py-0.2 rounded bg-sky-900 text-sky-300 animate-pulse";
        
        // Short visual delay
        await new Promise(r => setTimeout(r, 180));

        nodeEl.classList.remove("state-running");
        if (step.status === "success") {
          nodeEl.classList.add("state-success");
          nodeEl.querySelector(".node-exec-badge").textContent = `${step.duration_ms}ms`;
          nodeEl.querySelector(".node-exec-badge").className = "node-exec-badge text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800";
          
          // Animate outgoing edges
          state.workflow.edges.filter(e => e.source === step.node_id).forEach(e => {
            const edgeEl = document.getElementById(`edge-path-${e.id}`);
            if (edgeEl) edgeEl.classList.add("edge-path-active");
          });
        } else {
          nodeEl.classList.add("state-failed");
          nodeEl.querySelector(".node-exec-badge").textContent = "FAILED";
          nodeEl.querySelector(".node-exec-badge").className = "node-exec-badge text-[9px] font-mono px-1 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800";
        }
      }
    }
  }

  if (execution.status === "completed") {
    execStatusBadge.className = "text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono";
    execStatusBadge.textContent = "COMPLETED";
    showToast("Workflow execution completed successfully!");
  } else {
    execStatusBadge.className = "text-[11px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-400 border border-rose-800 font-mono";
    execStatusBadge.textContent = "FAILED";
    showToast("Workflow execution encountered an error", "error");
  }

  populateStepTrace(steps);
  if (steps.length > 0) selectStepTrace(steps[0].node_id);
}

function populateStepTrace(steps) {
  const listEl = document.getElementById("execution-steps-list");
  listEl.innerHTML = "";

  steps.forEach(s => {
    const isSuccess = s.status === "success";
    const isSkipped = s.status === "skipped";
    
    const item = document.createElement("div");
    item.className = `step-item p-2 rounded-md cursor-pointer flex items-center justify-between text-xs ${s.node_id === state.selectedStepNodeId ? 'selected' : ''}`;
    item.innerHTML = `
      <div class="flex items-center gap-2 overflow-hidden">
        <span class="w-2 h-2 rounded-full ${isSuccess ? 'bg-emerald-400' : isSkipped ? 'bg-slate-600' : 'bg-rose-400'}"></span>
        <span class="font-bold text-slate-200 truncate">${s.node_title || s.node_id}</span>
      </div>
      <span class="text-[10px] font-mono text-slate-400 shrink-0">${s.duration_ms !== undefined ? s.duration_ms + 'ms' : ''}</span>
    `;

    item.addEventListener("click", () => {
      document.querySelectorAll(".step-item").forEach(el => el.classList.remove("selected"));
      item.classList.add("selected");
      selectStepTrace(s.node_id, s);
    });

    listEl.appendChild(item);
  });
}

function selectStepTrace(nodeId, stepObj = null) {
  state.selectedStepNodeId = nodeId;
  const step = stepObj || (state.latestExecution?.steps ? state.latestExecution.steps.find(s => s.node_id === nodeId) : null);
  
  const titleEl = document.getElementById("selected-step-title");
  const durEl = document.getElementById("selected-step-duration");
  const inputEl = document.getElementById("step-input-json");
  const outputEl = document.getElementById("step-output-json");

  if (!step) {
    titleEl.textContent = "Select a step to inspect payload";
    durEl.textContent = "";
    inputEl.textContent = "{}";
    outputEl.textContent = "{}";
    return;
  }

  titleEl.textContent = step.node_title || step.node_id;
  durEl.textContent = `${step.duration_ms || 0}ms (${step.status})`;
  inputEl.textContent = JSON.stringify(step.input || {}, null, 2);
  outputEl.textContent = JSON.stringify(step.output || step.error_message || {}, null, 2);
}

// Save Workflow
async function saveWorkflowToBackend() {
  try {
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.workflow)
    });
    const data = await res.json();
    if (data.success && data.workflow) {
      state.workflow.id = data.workflow.id;
      showToast("Workflow saved successfully");
    }
  } catch (e) {
    showToast(`Error saving workflow: ${e.message}`, "error");
  }
}

// UI Event Listeners
function initEventListeners() {
  // Canvas Zoom & Pan
  canvasViewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(state.zoom * zoomFactor);
  });

  canvasViewport.addEventListener("mousedown", (e) => {
    if (e.target === canvasViewport || e.target.id === "canvas-svg" || e.target.tagName === "rect") {
      state.isPanning = true;
      state.panStart = { x: e.clientX - state.panX, y: e.clientY - state.panY };
      selectNode(null);
      selectEdge(null);
    }
  });

  window.addEventListener("mousemove", (e) => {
    // Canvas Pan
    if (state.isPanning) {
      state.panX = e.clientX - state.panStart.x;
      state.panY = e.clientY - state.panStart.y;
      updateCanvasTransform();
      return;
    }

    // Node Dragging
    if (state.draggingNodeId) {
      const node = state.workflow.nodes.find(n => n.id === state.draggingNodeId);
      if (node) {
        node.x = Math.round(((e.clientX / state.zoom) - state.dragOffset.x) / 10) * 10;
        node.y = Math.round(((e.clientY / state.zoom) - state.dragOffset.y) / 10) * 10;
        
        const nodeEl = document.getElementById(`node-${node.id}`);
        if (nodeEl) {
          nodeEl.style.left = `${node.x}px`;
          nodeEl.style.top = `${node.y}px`;
        }
        renderEdges();
        renderMinimap();
      }
      return;
    }

    // Port Connection Wire Dragging
    if (state.connectingPort) {
      updateTempEdge(e.clientX, e.clientY);
    }
  });

  window.addEventListener("mouseup", () => {
    state.isPanning = false;
    state.draggingNodeId = null;
    if (state.connectingPort) {
      state.connectingPort = null;
      tempEdge.classList.add("hidden");
    }
  });

  // Palette Drag and Drop onto Canvas
  const paletteItems = document.querySelectorAll(".palette-item");
  paletteItems.forEach(item => {
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/node-type", item.getAttribute("data-type"));
    });

    // Click to add
    item.addEventListener("click", () => {
      const type = item.getAttribute("data-type");
      const x = 200 - state.panX + (state.workflow.nodes.length * 40);
      const y = 200 - state.panY + (state.workflow.nodes.length * 30);
      addNode(type, x, y);
    });
  });

  canvasViewport.addEventListener("dragover", (e) => e.preventDefault());
  canvasViewport.addEventListener("drop", (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("text/node-type");
    if (!type) return;

    const rect = canvasViewport.getBoundingClientRect();
    const x = (e.clientX - rect.left - state.panX) / state.zoom;
    const y = (e.clientY - rect.top - state.panY) / state.zoom;
    addNode(type, x, y);
  });

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    
    if (e.key === "Delete" || e.key === "Backspace") {
      if (state.selectedNodeId) deleteNode(state.selectedNodeId);
      else if (state.selectedEdgeId) deleteEdge(state.selectedEdgeId);
    }
  });

  // Buttons
  document.getElementById("btn-zoom-in")?.addEventListener("click", () => setZoom(state.zoom * 1.2));
  document.getElementById("btn-zoom-out")?.addEventListener("click", () => setZoom(state.zoom * 0.8));
  document.getElementById("btn-zoom-reset")?.addEventListener("click", () => {
    state.panX = 0; state.panY = 0; setZoom(1.0);
  });
  document.getElementById("btn-auto-layout")?.addEventListener("click", autoLayoutDAG);
  document.getElementById("btn-save-wf")?.addEventListener("click", saveWorkflowToBackend);
  document.getElementById("btn-clear-canvas")?.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear the canvas?")) {
      state.workflow.nodes = [];
      state.workflow.edges = [];
      renderCanvas();
      selectNode(null);
    }
  });

  // Run Flow Button (opens payload modal if trigger is manual)
  document.getElementById("btn-run-wf")?.addEventListener("click", () => {
    const triggerNode = state.workflow.nodes.find(n => n.type.includes("trigger"));
    if (triggerNode && triggerNode.type === "manual_trigger") {
      document.getElementById("run-payload-input").value = 
        typeof triggerNode.data?.default_payload === 'string' 
          ? triggerNode.data.default_payload 
          : JSON.stringify(triggerNode.data?.default_payload || {}, null, 2);
      openModal("modal-run-payload");
    } else {
      executeWorkflow();
    }
  });

  document.getElementById("btn-confirm-execute")?.addEventListener("click", () => {
    let payload = {};
    try {
      payload = JSON.parse(document.getElementById("run-payload-input").value);
    } catch (e) {
      payload = { raw: document.getElementById("run-payload-input").value };
    }
    closeAllModals();
    executeWorkflow(payload);
  });

  // Test Single Step
  document.getElementById("btn-test-single-step")?.addEventListener("click", testSingleStep);

  // Inspector Close Button
  document.getElementById("btn-close-inspector")?.addEventListener("click", () => selectNode(null));

  // Drawer Toggle Button
  document.getElementById("btn-toggle-drawer")?.addEventListener("click", toggleDrawer);

  // Copy JSON Payload Button
  document.getElementById("btn-copy-payload")?.addEventListener("click", () => {
    const outJson = document.getElementById("step-output-json").textContent;
    navigator.clipboard.writeText(outJson);
    showToast("Output JSON copied to clipboard");
  });

  // AI Workflow Generator Modal
  document.getElementById("btn-open-ai-modal")?.addEventListener("click", () => openModal("modal-ai"));
  document.getElementById("btn-submit-ai-prompt")?.addEventListener("click", handleAIGenerate);
  document.querySelectorAll(".btn-prompt-suggestion").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("ai-prompt-input").value = btn.textContent.trim();
    });
  });

  // Webhook Modal
  document.getElementById("btn-webhook-info")?.addEventListener("click", openWebhookModal);
  document.getElementById("btn-copy-webhook-url")?.addEventListener("click", () => {
    const url = document.getElementById("webhook-url-display").value;
    navigator.clipboard.writeText(url);
    showToast("Webhook URL copied");
  });

  // Workflow Selector / Templates Switcher Modal
  document.getElementById("btn-wf-selector")?.addEventListener("click", openWorkflowsModal);
  document.getElementById("btn-tab-templates")?.addEventListener("click", openWorkflowsModal);
  document.getElementById("btn-create-blank-wf")?.addEventListener("click", () => {
    state.workflow = {
      id: `wf-${Date.now().toString(36)}`,
      name: "New Custom Automation",
      description: "Custom visual workflow",
      trigger_type: "manual",
      nodes: [
        { id: "node-trig-1", type: "manual_trigger", title: "Manual Trigger", x: 80, y: 200, data: getDefaultNodeData("manual_trigger") }
      ],
      edges: [],
      is_active: true
    };
    closeAllModals();
    updateHeaderUI();
    renderCanvas();
    showToast("Created blank workflow");
  });

  // History & Logs Tab
  document.getElementById("btn-tab-history")?.addEventListener("click", openHistoryModal);

  // Close Modals
  document.querySelectorAll(".btn-close-modal").forEach(btn => {
    btn.addEventListener("click", closeAllModals);
  });
}

function setZoom(newZoom) {
  state.zoom = Math.min(Math.max(newZoom, 0.4), 2.0);
  document.getElementById("label-zoom").textContent = `${Math.round(state.zoom * 100)}%`;
  updateCanvasTransform();
}

function updateCanvasTransform() {
  nodesContainer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  edgesGroup.setAttribute("transform", `translate(${state.panX}, ${state.panY}) scale(${state.zoom})`);
}

function toggleDrawer() {
  const drawer = document.getElementById("execution-drawer");
  state.isDrawerOpen = !state.isDrawerOpen;
  drawer.style.height = state.isDrawerOpen ? "240px" : "40px";
}

function openDrawer() {
  const drawer = document.getElementById("execution-drawer");
  state.isDrawerOpen = true;
  drawer.style.height = "240px";
}

// AI Generator Action
async function handleAIGenerate() {
  const prompt = document.getElementById("ai-prompt-input").value.trim();
  if (!prompt) return;

  const btn = document.getElementById("btn-submit-ai-prompt");
  btn.disabled = true;
  btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> Synthesizing DAG...`;

  try {
    const res = await fetch("/api/ai/generate-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt })
    });
    const data = await res.json();
    if (data.success && data.workflow) {
      state.workflow = data.workflow;
      closeAllModals();
      updateHeaderUI();
      renderCanvas();
      showToast("AI synthesized workflow generated successfully!");
    } else {
      showToast(`Generation failed: ${data.error}`, "error");
    }
  } catch (e) {
    showToast(`Error: ${e.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="ph-fill ph-magic-wand"></i> Generate Workflow`;
  }
}

// Webhook Modal
function openWebhookModal() {
  const wfId = state.workflow.id || "wf-default";
  const origin = window.location.origin;
  const webhookUrl = `${origin}/api/webhooks/${wfId}`;
  
  document.getElementById("webhook-url-display").value = webhookUrl;
  document.getElementById("webhook-curl-display").textContent = 
`curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"lead_id": "LD-101", "email": "customer@example.com", "score": 88}'`;

  openModal("modal-webhook");
}

// Workflows & Templates List Modal
async function openWorkflowsModal() {
  const listEl = document.getElementById("modal-workflows-list");
  listEl.innerHTML = `<div class="p-6 text-center text-xs text-slate-400"><i class="ph-bold ph-spinner animate-spin text-lg mb-2"></i><br>Loading workflows and templates...</div>`;
  openModal("modal-workflows");

  try {
    const [wfsRes, tplsRes] = await Promise.all([
      fetch("/api/workflows").then(r => r.json()),
      fetch("/api/templates").then(r => r.json())
    ]);

    let html = `
      <!-- User Saved Workflows -->
      <div class="space-y-2">
        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Workflows</span>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          ${(wfsRes.workflows || []).map(w => `
            <div class="p-3 rounded-lg border border-slate-800 bg-slate-950/60 hover:border-indigo-500/60 flex items-center justify-between cursor-pointer transition btn-select-saved-wf" data-id="${w.id}">
              <div class="overflow-hidden">
                <div class="font-bold text-xs text-slate-200 truncate">${escapeHtml(w.name)}</div>
                <div class="text-[10px] text-slate-400 font-mono">${w.trigger_type} trigger</div>
              </div>
              <button class="text-xs text-indigo-400 font-semibold hover:underline">Open</button>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Pre-built Template Gallery -->
      <div class="space-y-2 pt-3 border-t border-slate-800">
        <span class="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
          <i class="ph-fill ph-sparkle"></i> Pre-Built Template Gallery
        </span>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          ${(tplsRes.templates || []).map(t => `
            <div class="p-3 rounded-lg border border-slate-800 bg-slate-950/40 hover:border-indigo-500/50 flex flex-col justify-between cursor-pointer transition btn-instantiate-tpl" data-id="${t.id}">
              <div>
                <div class="flex items-center justify-between gap-1 mb-1">
                  <span class="font-bold text-xs text-slate-200">${escapeHtml(t.name)}</span>
                  <span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono">${t.category}</span>
                </div>
                <p class="text-[11px] text-slate-400 line-clamp-2">${escapeHtml(t.description)}</p>
              </div>
              <div class="pt-2 flex items-center justify-between">
                <span class="text-[10px] text-slate-500 font-mono">${t.nodes.length} nodes</span>
                <button class="text-xs text-indigo-400 font-bold hover:underline flex items-center gap-1">Use Template <i class="ph-bold ph-arrow-right"></i></button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    listEl.innerHTML = html;

    // Attach listeners
    listEl.querySelectorAll(".btn-select-saved-wf").forEach(el => {
      el.addEventListener("click", async () => {
        const id = el.getAttribute("data-id");
        const full = await fetch(`/api/workflows/${id}`).then(r => r.json());
        if (full.workflow) {
          state.workflow = full.workflow;
          closeAllModals();
          updateHeaderUI();
          renderCanvas();
          showToast(`Opened '${full.workflow.name}'`);
        }
      });
    });

    listEl.querySelectorAll(".btn-instantiate-tpl").forEach(el => {
      el.addEventListener("click", async () => {
        const id = el.getAttribute("data-id");
        const res = await fetch(`/api/templates/${id}/instantiate`, { method: "POST" });
        const data = await res.json();
        if (data.workflow) {
          state.workflow = data.workflow;
          closeAllModals();
          updateHeaderUI();
          renderCanvas();
          showToast(`Created workflow from template!`);
        }
      });
    });

  } catch (e) {
    listEl.innerHTML = `<div class="p-6 text-center text-xs text-rose-400">Failed to load workflows: ${e.message}</div>`;
  }
}

// Execution History Modal
async function openHistoryModal() {
  const listEl = document.getElementById("modal-workflows-list");
  document.getElementById("modal-wf-title").textContent = "Execution History & Audit Log";
  listEl.innerHTML = `<div class="p-6 text-center text-xs text-slate-400"><i class="ph-bold ph-spinner animate-spin text-lg mb-2"></i><br>Loading history traces...</div>`;
  openModal("modal-workflows");

  try {
    const res = await fetch(`/api/executions?workflow_id=${state.workflow.id || ''}`);
    const data = await res.json();
    const execs = data.executions || [];

    if (execs.length === 0) {
      listEl.innerHTML = `<div class="p-8 text-center text-xs text-slate-500">No execution runs recorded yet. Click "Execute Flow" to run.</div>`;
      return;
    }

    listEl.innerHTML = `
      <div class="space-y-2">
        ${execs.map(e => `
          <div class="p-3 rounded-lg border border-slate-800 bg-slate-950/60 hover:border-slate-700 flex items-center justify-between text-xs">
            <div class="flex items-center gap-3">
              <span class="w-2.5 h-2.5 rounded-full ${e.status === 'completed' ? 'bg-emerald-400' : 'bg-rose-400'}"></span>
              <div>
                <div class="font-bold text-slate-200">${escapeHtml(e.workflow_name || 'Workflow')}</div>
                <div class="text-[10px] text-slate-400 font-mono">${new Date(e.started_at * 1000).toLocaleString()} • ${e.trigger_type} trigger</div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-[11px] font-mono text-slate-400">${e.duration_ms || 0}ms</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded ${e.status === 'completed' ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'}">${e.status.toUpperCase()}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    listEl.innerHTML = `<div class="p-6 text-center text-xs text-rose-400">Failed to load history: ${e.message}</div>`;
  }
}

// Modal Helpers
function openModal(modalId) {
  document.getElementById(modalId)?.classList.remove("hidden");
}

function closeAllModals() {
  document.querySelectorAll("[id^='modal-']").forEach(m => m.classList.add("hidden"));
}

// Toast Notifications
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const msgEl = document.getElementById("toast-message");
  const iconEl = document.getElementById("toast-icon");

  msgEl.textContent = message;
  if (type === "error") {
    iconEl.className = "ph-fill ph-warning-circle text-rose-400 text-base";
    toast.className = "fixed top-4 right-4 z-50 bg-slate-900 border border-rose-800 text-slate-100 text-xs px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2 transform translate-y-0 opacity-100 transition-all duration-300";
  } else {
    iconEl.className = "ph-fill ph-check-circle text-emerald-400 text-base";
    toast.className = "fixed top-4 right-4 z-50 bg-slate-900 border border-slate-700 text-slate-100 text-xs px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2 transform translate-y-0 opacity-100 transition-all duration-300";
  }

  setTimeout(() => {
    toast.className = "fixed top-4 right-4 z-50 bg-slate-900 border border-slate-700 text-slate-100 text-xs px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2 transform translate-y-[-100px] opacity-0 transition-all duration-300";
  }, 3200);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
