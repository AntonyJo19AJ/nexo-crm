/* ==========================================================================
   Nexo CRM — Lógica de interfaz (JavaScript vanilla)
   - Consumo de API REST con fetch
   - Búsqueda dinámica y filtros por estado
   - Modales de creación/edición y confirmación de borrado
   - Validaciones, toasts y estados de carga
   ========================================================================== */
(() => {
    "use strict";

    const API = {
        clients: "/api/clients/",
        stats: "/api/stats/",
    };

    const STATUS_FALLBACK = [
        { value: "prospecto", label: "Prospecto" },
        { value: "cliente", label: "Cliente" },
        { value: "inactivo", label: "Inactivo" },
    ];

    const AVATAR_PALETTES = [
        { bg: "#eef2ff", fg: "#4338ca" },
        { bg: "#ecfdf3", fg: "#047857" },
        { bg: "#fff7ed", fg: "#c2410c" },
        { bg: "#fdf2f8", fg: "#be185d" },
        { bg: "#eff8ff", fg: "#175cd3" },
        { bg: "#f5f3ff", fg: "#6d28d9" },
    ];

    const state = {
        clients: [],
        stats: null,
        query: "",
        status: "",
        editingId: null,
        pendingDelete: null,
        loadFailed: false,
        submitLabel: "Guardar cliente",
    };

    let statuses = STATUS_FALLBACK;
    let refs = {};
    let searchTimer = null;
    let clientsRequest = 0;

    class ApiError extends Error {
        constructor(message, errors = null, status = 0) {
            super(message);
            this.name = "ApiError";
            this.errors = errors;
            this.status = status;
        }
    }

    /* Utilidades ---------------------------------------------------------- */

    const $ = (id) => document.getElementById(id);

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function icon(name, className = "icon") {
        const SVG_NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", className);
        svg.setAttribute("aria-hidden", "true");
        const use = document.createElementNS(SVG_NS, "use");
        use.setAttribute("href", `#i-${name}`);
        svg.appendChild(use);
        return svg;
    }

    function getCookie(name) {
        const entry = document.cookie
            .split("; ")
            .find((row) => row.startsWith(`${name}=`));
        return entry ? decodeURIComponent(entry.split("=").slice(1).join("=")) : "";
    }

    function isTyping(target) {
        return (
            target instanceof HTMLElement &&
            (target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.tagName === "SELECT" ||
                target.isContentEditable)
        );
    }

    function statusLabel(value) {
        const match = statuses.find((item) => item.value === value);
        return match ? match.label : value;
    }

    function avatarPalette(name) {
        let hash = 0;
        for (let index = 0; index < name.length; index += 1) {
            hash = (hash * 31 + name.charCodeAt(index)) % 9973;
        }
        return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
    }

    const dateFormatter = new Intl.DateTimeFormat("es-EC", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });

    function formatDate(isoDate) {
        const date = new Date(isoDate);
        if (Number.isNaN(date.getTime())) return "—";
        return dateFormatter.format(date).replace(/\./g, "");
    }

    /* Capa de red --------------------------------------------------------- */

    async function request(url, options = {}) {
        const method = options.method || "GET";
        const headers = { Accept: "application/json" };

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }
        if (method !== "GET") {
            headers["X-CSRFToken"] = getCookie("csrftoken");
        }

        let response;
        try {
            response = await fetch(url, {
                method,
                headers,
                credentials: "same-origin",
                body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
            });
        } catch (error) {
            throw new ApiError("No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
        }

        if (response.status === 204) return null;

        let data = null;
        try {
            data = await response.json();
        } catch (error) {
            data = null;
        }

        if (!response.ok) {
            throw new ApiError(
                (data && data.message) || "Ocurrió un error inesperado. Inténtalo de nuevo.",
                (data && data.errors) || null,
                response.status
            );
        }

        return data;
    }

    /* Toasts -------------------------------------------------------------- */

    function removeToast(toast) {
        if (!toast.isConnected) return;
        toast.classList.add("is-leaving");
        window.setTimeout(() => toast.remove(), 200);
    }

    function toast(title, text, type = "success") {
        const icons = { success: "check", error: "alert", info: "spark" };
        const box = element("div", `toast toast--${type}`);
        box.setAttribute("role", type === "error" ? "alert" : "status");

        const badge = element("span", "toast__icon");
        badge.appendChild(icon(icons[type] || "check"));

        const body = element("div", "toast__body");
        body.appendChild(element("p", "toast__title", title));
        if (text) body.appendChild(element("p", "toast__text", text));

        const close = element("button", "toast__close");
        close.type = "button";
        close.setAttribute("aria-label", "Cerrar notificación");
        close.appendChild(icon("close"));
        close.addEventListener("click", () => removeToast(box));

        box.append(badge, body, close);
        refs.toasts.appendChild(box);

        while (refs.toasts.children.length > 3) {
            refs.toasts.firstElementChild.remove();
        }

        const timer = window.setTimeout(() => removeToast(box), 4600);
        box.addEventListener("mouseenter", () => window.clearTimeout(timer));
        box.addEventListener("focusin", () => window.clearTimeout(timer));
    }

    /* Métricas ------------------------------------------------------------ */

    function animateNumber(node, value) {
        const target = Number(value) || 0;
        const startValue = Number(node.dataset.value || 0);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (reduced || startValue === target) {
            node.textContent = String(target);
            node.dataset.value = String(target);
            return;
        }

        const duration = 480;
        const startTime = performance.now();

        function tick(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            node.textContent = String(Math.round(startValue + (target - startValue) * eased));
            if (progress < 1) {
                window.requestAnimationFrame(tick);
            } else {
                node.textContent = String(target);
                node.dataset.value = String(target);
            }
        }

        window.requestAnimationFrame(tick);
    }

    function renderStats(stats) {
        animateNumber(refs.statTotal, stats.total);
        animateNumber(refs.statProspecto, stats.prospecto);
        animateNumber(refs.statCliente, stats.cliente);
        animateNumber(refs.statInactivo, stats.inactivo);

        refs.statConversion.textContent = `${stats.conversion}%`;
        refs.navCount.textContent = String(stats.total);
        updateFilterCounts();
    }

    async function loadStats() {
        try {
            const stats = await request(API.stats);
            state.stats = stats;
            renderStats(stats);
        } catch (error) {
            toast("No se pudieron cargar las métricas", error.message, "error");
        }
    }

    /* Filtros ------------------------------------------------------------- */

    function buildFilters() {
        refs.filters.innerHTML = "";

        const options = [{ value: "", label: "Todos" }, ...statuses];
        options.forEach((option) => {
            const button = element("button", "filter");
            button.type = "button";
            button.dataset.status = option.value;
            button.setAttribute("aria-pressed", String(state.status === option.value));
            if (state.status === option.value) button.classList.add("is-active");

            button.appendChild(element("span", null, option.label));

            const count = element("span", "filter__count", "0");
            count.dataset.count = "total";
            button.appendChild(count);

            button.addEventListener("click", () => {
                if (state.status === option.value) return;
                state.status = option.value;
                updateFilterState();
                loadClients();
            });

            refs.filters.appendChild(button);
        });
    }

    function updateFilterState() {
        Array.from(refs.filters.children).forEach((button) => {
            const active = button.dataset.status === state.status;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function updateFilterCounts() {
        if (!state.stats) return;
        const counts = {
            "": state.stats.total,
            prospecto: state.stats.prospecto,
            cliente: state.stats.cliente,
            inactivo: state.stats.inactivo,
        };

        refs.filters.querySelectorAll("[data-count]").forEach((node) => {
            const value = counts[node.closest(".filter").dataset.status];
            if (value !== undefined) node.textContent = String(value);
        });
    }

    /* Tabla de clientes --------------------------------------------------- */

    function setLoading(loading) {
        refs.tableWrap.setAttribute("aria-busy", String(loading));
        refs.tableLoading.hidden = !loading;
    }

    function updateCount(total) {
        refs.clientsCount.textContent = String(total);
        refs.clientsCountLabel.textContent = total === 1 ? "cliente" : "clientes";
        refs.navCount.textContent = state.stats ? String(state.stats.total) : String(total);
    }

    function updateLastUpdated() {
        const time = new Intl.DateTimeFormat("es-EC", {
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date());
        refs.lastUpdated.textContent = time;
    }

    function buildRow(client) {
        const row = document.createElement("tr");
        row.dataset.id = String(client.id);

        const clientCell = element("td", "cell-client");
        clientCell.dataset.label = "Cliente";

        const palette = avatarPalette(client.name);
        const avatar = element("span", "avatar", client.initials || "?");
        avatar.style.setProperty("--avatar-bg", palette.bg);
        avatar.style.setProperty("--avatar-fg", palette.fg);
        avatar.setAttribute("aria-hidden", "true");

        const info = element("span", "cell-client__info");
        info.appendChild(element("span", "cell-client__name", client.name));
        info.appendChild(element("span", "cell-client__email", client.email));
        clientCell.append(avatar, info);

        const companyCell = element("td", "cell-company", client.company || "—");
        companyCell.dataset.label = "Empresa";

        const phoneCell = element("td", "cell-phone", client.phone || "—");
        phoneCell.dataset.label = "Teléfono";

        const statusCell = element("td", "cell-status");
        statusCell.dataset.label = "Estado";
        const badge = element("span", `badge badge--${client.status}`, statusLabel(client.status));
        statusCell.appendChild(badge);

        const createdCell = element("td", "cell-created", formatDate(client.created_at));
        createdCell.dataset.label = "Registrado";

        const actionsCell = element("td", "cell-actions");
        const actions = element("div", "row-actions");

        const editButton = element("button", "row-action row-action--edit");
        editButton.type = "button";
        editButton.dataset.action = "edit";
        editButton.dataset.id = String(client.id);
        editButton.title = "Editar cliente";
        editButton.setAttribute("aria-label", `Editar a ${client.name}`);
        editButton.appendChild(icon("edit"));

        const deleteButton = element("button", "row-action row-action--delete");
        deleteButton.type = "button";
        deleteButton.dataset.action = "delete";
        deleteButton.dataset.id = String(client.id);
        deleteButton.title = "Eliminar cliente";
        deleteButton.setAttribute("aria-label", `Eliminar a ${client.name}`);
        deleteButton.appendChild(icon("trash"));

        actions.append(editButton, deleteButton);
        actionsCell.appendChild(actions);

        row.append(clientCell, companyCell, phoneCell, statusCell, createdCell, actionsCell);
        return row;
    }

    function renderEmpty() {
        const filtered = Boolean(state.query || state.status);
        refs.table.hidden = true;
        refs.empty.hidden = false;

        if (state.loadFailed) {
            refs.emptyTitle.textContent = "No pudimos cargar los clientes";
            refs.emptyText.textContent = "Revisa tu conexión e inténtalo de nuevo.";
            refs.emptyActionLabel.textContent = "Reintentar";
        } else if (filtered) {
            refs.emptyTitle.textContent = "Sin resultados";
            refs.emptyText.textContent =
                "No encontramos clientes que coincidan con tu búsqueda o filtro. Prueba con otros criterios.";
            refs.emptyActionLabel.textContent = "Limpiar filtros";
        } else {
            refs.emptyTitle.textContent = "Aún no hay clientes";
            refs.emptyText.textContent =
                "Registra tu primer cliente para empezar a construir tu cartera.";
            refs.emptyActionLabel.textContent = "Registrar cliente";
        }
    }

    function renderClients() {
        refs.tbody.innerHTML = "";

        if (!state.clients.length) {
            renderEmpty();
            return;
        }

        refs.loadFailed = false;
        refs.table.hidden = false;
        refs.empty.hidden = true;

        const fragment = document.createDocumentFragment();
        state.clients.forEach((client) => fragment.appendChild(buildRow(client)));
        refs.tbody.appendChild(fragment);
    }

    async function loadClients() {
        const requestId = ++clientsRequest;
        setLoading(true);

        const params = new URLSearchParams();
        if (state.query) params.set("q", state.query);
        if (state.status) params.set("status", state.status);
        const queryString = params.toString();

        try {
            const data = await request(`${API.clients}${queryString ? `?${queryString}` : ""}`);
            if (requestId !== clientsRequest) return;

            state.clients = data.clients;
            state.loadFailed = false;
            renderClients();
            updateCount(data.count);
            updateLastUpdated();
        } catch (error) {
            if (requestId !== clientsRequest) return;

            state.clients = [];
            state.loadFailed = true;
            refs.tbody.innerHTML = "";
            renderEmpty();
            updateCount(0);
            toast("No se pudo cargar el directorio", error.message, "error");
        } finally {
            if (requestId === clientsRequest) setLoading(false);
        }
    }

    function refreshAll() {
        return Promise.all([loadClients(), loadStats()]);
    }

    /* Formulario de cliente ------------------------------------------------ */

    function clearFormErrors() {
        refs.form.querySelectorAll(".field.has-error").forEach((field) => {
            field.classList.remove("has-error");
        });
        refs.form.querySelectorAll(".field__error").forEach((error) => {
            error.textContent = "";
        });
    }

    function setFormErrors(errors) {
        clearFormErrors();
        let firstInvalid = null;

        Object.entries(errors || {}).forEach(([fieldName, messages]) => {
            const input = refs.fields[fieldName];
            if (!input) return;

            const wrapper = input.closest(".field");
            const errorNode = $(`error-${fieldName}`);
            const message = Array.isArray(messages) ? messages[0] : String(messages);

            if (wrapper) wrapper.classList.add("has-error");
            if (errorNode) errorNode.textContent = message;
            if (!firstInvalid) firstInvalid = input;
        });

        if (firstInvalid) firstInvalid.focus();
    }

    function validateForm() {
        const errors = {};
        const name = refs.fields.name.value.trim();
        const email = refs.fields.email.value.trim();
        const phone = refs.fields.phone.value.trim();
        const company = refs.fields.company.value.trim();

        if (name.length < 2) {
            errors.name = "Ingresa el nombre completo del cliente (mínimo 2 caracteres).";
        }
        if (!email) {
            errors.email = "El correo electrónico es obligatorio.";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            errors.email = "Ingresa un correo electrónico válido.";
        }
        if (phone && !/^[0-9+\-()\s]{6,25}$/.test(phone)) {
            errors.phone = "Usa solo números, espacios, paréntesis, guiones o el signo +.";
        }
        if (company.length > 120) {
            errors.company = "La empresa no puede superar los 120 caracteres.";
        }

        return errors;
    }

    function setSubmitting(submitting) {
        refs.btnSubmit.disabled = submitting;
        refs.submitSpinner.hidden = !submitting;
        refs.submitLabel.textContent = submitting ? "Guardando…" : state.submitLabel;
    }

    /**
     * Reactiva el scroll del documento cuando ya no queda ningún diálogo
     * abierto. Se llama al cerrar para no depender solo del evento "close".
     */
    function releaseScrollLock() {
        if (!document.querySelector("dialog[open]")) {
            document.body.style.overflow = "";
        }
    }

    function openClientModal(client = null) {
        state.editingId = client ? client.id : null;
        refs.form.reset();
        clearFormErrors();

        if (client) {
            refs.fields.name.value = client.name;
            refs.fields.company.value = client.company || "";
            refs.fields.email.value = client.email;
            refs.fields.phone.value = client.phone || "";
            refs.fields.status.value = client.status;
            refs.modalTitle.textContent = "Editar cliente";
            refs.modalSubtitle.textContent = "Actualiza la información del cliente.";
            state.submitLabel = "Guardar cambios";
        } else {
            refs.fields.status.value = "prospecto";
            refs.modalTitle.textContent = "Nuevo cliente";
            refs.modalSubtitle.textContent = "Completa los datos para registrar un cliente.";
            state.submitLabel = "Guardar cliente";
        }

        setSubmitting(false);
        refs.clientModal.showModal();
        document.body.style.overflow = "hidden";
        window.setTimeout(() => refs.fields.name.focus(), 60);
    }

    function closeClientModal() {
        if (refs.clientModal.open) refs.clientModal.close();
        state.editingId = null;
        setSubmitting(false);
        releaseScrollLock();
    }

    async function submitClient(event) {
        event.preventDefault();
        clearFormErrors();

        const errors = validateForm();
        if (Object.keys(errors).length) {
            setFormErrors(errors);
            toast("Revisa el formulario", "Hay campos que necesitan tu atención.", "error");
            return;
        }

        const payload = {
            name: refs.fields.name.value.trim(),
            company: refs.fields.company.value.trim(),
            email: refs.fields.email.value.trim(),
            phone: refs.fields.phone.value.trim(),
            status: refs.fields.status.value,
        };

        const isEditing = Boolean(state.editingId);
        const clientId = state.editingId;
        setSubmitting(true);

        try {
            if (isEditing) {
                await request(`${API.clients}${clientId}/`, { method: "PATCH", body: payload });
            } else {
                await request(API.clients, { method: "POST", body: payload });
            }

            closeClientModal();
            toast(
                isEditing ? "Cliente actualizado" : "Cliente registrado",
                `${payload.name} se guardó correctamente.`,
                "success"
            );
            await refreshAll();
        } catch (error) {
            if (error.errors) setFormErrors(error.errors);
            toast("No se pudo guardar", error.message, "error");
        } finally {
            setSubmitting(false);
        }
    }

    /* Eliminación --------------------------------------------------------- */

    function openDeleteModal(client) {
        state.pendingDelete = client;
        refs.deleteName.textContent = client.name;
        refs.deleteModal.showModal();
        document.body.style.overflow = "hidden";
        window.setTimeout(() => refs.btnConfirmDelete.focus(), 60);
    }

    function closeDeleteModal() {
        if (refs.deleteModal.open) refs.deleteModal.close();
        state.pendingDelete = null;
        setDeleteSubmitting(false);
        releaseScrollLock();
    }

    function setDeleteSubmitting(submitting) {
        refs.btnConfirmDelete.disabled = submitting;
        refs.deleteSpinner.hidden = !submitting;
        refs.deleteLabel.textContent = submitting ? "Eliminando…" : "Sí, eliminar";
    }

    async function confirmDelete() {
        const client = state.pendingDelete;
        if (!client) return;

        setDeleteSubmitting(true);
        try {
            await request(`${API.clients}${client.id}/`, { method: "DELETE" });
            closeDeleteModal();
            toast("Cliente eliminado", `${client.name} se eliminó de tu cartera.`, "success");
            await refreshAll();
        } catch (error) {
            setDeleteSubmitting(false);
            if (error.status === 404) {
                closeDeleteModal();
                toast("El cliente ya no existe", "Actualizamos el directorio.", "info");
                await refreshAll();
                return;
            }
            toast("No se pudo eliminar", error.message, "error");
        }
    }

    /* Filtros y búsqueda --------------------------------------------------- */

    function resetFilters() {
        state.query = "";
        state.status = "";
        refs.searchInput.value = "";
        refs.clearSearch.hidden = true;
        updateFilterState();
        loadClients();
    }

    /* Barra lateral móvil -------------------------------------------------- */

    function openSidebar() {
        refs.sidebar.classList.add("is-open");
        refs.overlay.hidden = false;
        window.requestAnimationFrame(() => refs.overlay.classList.add("is-visible"));
        refs.menuToggle.setAttribute("aria-expanded", "true");
        document.body.style.overflow = "hidden";
    }

    function closeSidebar() {
        refs.sidebar.classList.remove("is-open");
        refs.overlay.classList.remove("is-visible");
        refs.menuToggle.setAttribute("aria-expanded", "false");
        window.setTimeout(() => {
            if (!refs.sidebar.classList.contains("is-open")) refs.overlay.hidden = true;
        }, 260);
        if (!document.querySelector("dialog[open]")) document.body.style.overflow = "";
    }

    /* Inicialización ------------------------------------------------------- */

    function cacheRefs() {
        refs = {
            sidebar: $("sidebar"),
            overlay: $("sidebar-overlay"),
            menuToggle: $("menu-toggle"),
            sidebarClose: $("sidebar-close"),
            todayLabel: $("today-label"),
            searchInput: $("search-input"),
            clearSearch: $("clear-search"),
            filters: $("status-filters"),
            tableWrap: $("table-wrap"),
            table: $("clients-table"),
            tbody: $("clients-tbody"),
            tableLoading: $("table-loading"),
            empty: $("empty-state"),
            emptyTitle: $("empty-title"),
            emptyText: $("empty-text"),
            emptyAction: $("empty-action"),
            emptyActionLabel: $("empty-action").querySelector("span"),
            clientsCount: $("clients-count"),
            clientsCountLabel: $("clients-count-label"),
            navCount: $("nav-count"),
            lastUpdated: $("last-updated"),
            statTotal: $("stat-total"),
            statProspecto: $("stat-prospecto"),
            statCliente: $("stat-cliente"),
            statInactivo: $("stat-inactivo"),
            statConversion: $("stat-conversion"),
            btnNewClient: $("btn-new-client"),
            clientModal: $("client-modal"),
            modalTitle: $("modal-title"),
            modalSubtitle: $("modal-subtitle"),
            form: $("client-form"),
            fields: {
                name: $("field-name"),
                company: $("field-company"),
                email: $("field-email"),
                phone: $("field-phone"),
                status: $("field-status"),
            },
            btnSubmit: $("btn-submit"),
            submitLabel: $("btn-submit").querySelector(".btn__label"),
            submitSpinner: $("submit-spinner"),
            deleteModal: $("delete-modal"),
            deleteName: $("delete-client-name"),
            btnConfirmDelete: $("btn-confirm-delete"),
            deleteSpinner: $("delete-spinner"),
            deleteLabel: $("btn-confirm-delete").querySelector(".btn__label"),
            toasts: $("toast-container"),
        };
    }

    function bindEvents() {
        refs.btnNewClient.addEventListener("click", () => openClientModal());
        refs.emptyAction.addEventListener("click", () => {
            if (state.loadFailed) {
                loadClients();
            } else if (state.query || state.status) {
                resetFilters();
            } else {
                openClientModal();
            }
        });

        refs.form.addEventListener("submit", submitClient);

        // La "x" vive en el encabezado del modal, fuera del <form>,
        // por eso se enlaza desde el diálogo y no desde el formulario.
        refs.clientModal.querySelectorAll("[data-close-modal]").forEach((button) => {
            button.addEventListener("click", closeClientModal);
        });
        refs.clientModal.addEventListener("close", () => {
            state.editingId = null;
            setSubmitting(false);
            releaseScrollLock();
        });
        refs.clientModal.addEventListener("click", (event) => {
            if (event.target === refs.clientModal) closeClientModal();
        });

        refs.btnConfirmDelete.addEventListener("click", confirmDelete);
        refs.deleteModal.querySelectorAll("[data-close-delete]").forEach((button) => {
            button.addEventListener("click", closeDeleteModal);
        });
        refs.deleteModal.addEventListener("close", () => {
            state.pendingDelete = null;
            setDeleteSubmitting(false);
            releaseScrollLock();
        });
        refs.deleteModal.addEventListener("click", (event) => {
            if (event.target === refs.deleteModal) closeDeleteModal();
        });

        refs.tbody.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-action]");
            if (!button) return;
            const client = state.clients.find(
                (item) => item.id === Number(button.dataset.id)
            );
            if (!client) return;

            if (button.dataset.action === "edit") {
                openClientModal(client);
            } else if (button.dataset.action === "delete") {
                openDeleteModal(client);
            }
        });

        refs.searchInput.addEventListener("input", () => {
            state.query = refs.searchInput.value.trim();
            refs.clearSearch.hidden = !refs.searchInput.value;
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(loadClients, 280);
        });

        refs.clearSearch.addEventListener("click", () => {
            refs.searchInput.value = "";
            state.query = "";
            refs.clearSearch.hidden = true;
            refs.searchInput.focus();
            loadClients();
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "/" && !isTyping(event.target)) {
                event.preventDefault();
                refs.searchInput.focus();
                refs.searchInput.select();
            }
        });

        refs.menuToggle.addEventListener("click", () => {
            if (refs.sidebar.classList.contains("is-open")) closeSidebar();
            else openSidebar();
        });
        refs.sidebarClose.addEventListener("click", closeSidebar);
        refs.overlay.addEventListener("click", closeSidebar);
        refs.sidebar.querySelectorAll(".nav__item[href]").forEach((link) => {
            link.addEventListener("click", () => {
                if (window.matchMedia("(max-width: 1024px)").matches) closeSidebar();
            });
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth > 1024 && refs.sidebar.classList.contains("is-open")) {
                closeSidebar();
            }
        });
    }

    function setToday() {
        const formatter = new Intl.DateTimeFormat("es-EC", {
            weekday: "short",
            day: "numeric",
            month: "short",
        });
        refs.todayLabel.textContent = formatter.format(new Date()).replace(/\./g, "");
    }

    function readStatuses() {
        const node = $("status-choices");
        if (!node) return;
        try {
            const parsed = JSON.parse(node.textContent);
            if (Array.isArray(parsed) && parsed.length) {
                statuses = parsed.map(([value, label]) => ({ value, label }));
            }
        } catch (error) {
            statuses = STATUS_FALLBACK;
        }
    }

    function init() {
        readStatuses();
        cacheRefs();
        setToday();
        buildFilters();
        bindEvents();
        refreshAll();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
