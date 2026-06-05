/**
 * FileDrop — handles drag-drop of external files and clipboard paste of files.
 *
 * Overlay containers are created dynamically, never parented to the document tree
 * until needed, and are always sized/positioned to cover each drop zone's bounding
 * box exactly.
 */


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileDropContext {
    /** Reference to the active FileDrop instance. */
    self: FileDrop;
    /** The zone element this overlay is covering. (Null for global events) */
    zone: Element | null;
    /** The live bounding box of that zone. (Null for global events) */
    zoneBounds: DOMRect | null;
    /** The overlay container element itself (null if not yet created). */
    container: HTMLElement | null;
    /** Current drag/paste event (if available). */
    event: DragEvent | ClipboardEvent | null;
    /** Files being dragged / pasted (populated once determinable). */
    files: File[] | null;
    /** Whether the files satisfy any consumer-defined validity check. */
    isValid: boolean | null;
    /** Which phase triggered this indicator: possible | valid | invalid */
    phase: "possible" | "valid" | "invalid";
    /** All currently active drop zones. */
    allZones: Element[];
    /** Whether the pointer is currently inside this zone. */
    isHovered: boolean;
}

/**
 * dragStart: Emitted globally when a drag operation begins (the moment files enter the browser window) or when a paste operation starts.
 * dragEnd: Emitted globally when a drag operation concludes (due to a drop or the user leaving the window) or when the paste "flash" indicator finishes.
 * over: Emitted when the pointer enters an allowed drop zone.
 * leave: Emitted when the pointer leaves an allowed drop zone.
 * drop: Emitted when files are successfully dropped into a valid zone.
 */
export type FileDropEvent = 'drop' | 'dragStart' | 'dragEnd' | 'over' | 'leave';

export type FileDropEventHandler = (ctx: FileDropContext) => void;

export interface FileDropOptions {

    container?: HTMLElement | null;
    /** Scale/inset the indicators relative to the zone bounding box. Default: 0 */
    indicatorPadding?: number;
    /**
     * Returns an Element to render inside the overlay container when a file is
     * being dragged anywhere on the page (showing *possible* drop zones).
     */
    possibleDropZoneIndicatorElem?: (context: FileDropContext) => Element | null;

    /**
     * Returns an Element to render inside the overlay container when the pointer
     * is over a zone and the files are *valid* for that zone.
     */
    validDropZoneIndicatorElem?: (context: FileDropContext) => Element | null;

    /**
     * Returns an Element to render inside the overlay container when the pointer
     * is over a zone and the files are *invalid* for that zone.
     */
    invalidDropZoneIndicatorElem?: (context: FileDropContext) => Element | null;

    /**
     * Returns the elements that act as drop zones. Evaluated on each drag-enter
     * and paste event so the list can be dynamic.
     */
    allowedZones?: (context: Omit<FileDropContext, "zone" | "zoneBounds" | "container" | "phase" | "isHovered" | "allZones">) => Element[];

    /**
     * Optional per-zone / per-file validation. Return true to mark files as
     * valid for the hovered zone.
     */
    isValidDrop?: (context: FileDropContext) => boolean;

    /** Enable drag-and-drop. Default: true */
    canDragDrop?: boolean;

    /** Enable clipboard paste. Default: true */
    canPaste?: boolean;

    /**
     * Show overlays over every allowed zone as soon as a drag starts (before the
     * pointer enters any specific zone). Default: true
     */
    showPossibleZones?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvedOptions(options: FileDropOptions): Required<FileDropOptions> {
    return {
        possibleDropZoneIndicatorElem: FileDrop.defaultPossibleIndicator,
        validDropZoneIndicatorElem: FileDrop.defaultValidIndicator,
        invalidDropZoneIndicatorElem: FileDrop.defaultInvalidIndicator,
        allowedZones: () => [],
        isValidDrop: () => true,
        canDragDrop: true,
        canPaste: true,
        showPossibleZones: true,
        container: null,
        indicatorPadding: 0,
        ...options,
    };
}

function extractFiles(dt: DataTransfer | null): File[] {
    if (!dt) return [];
    return Array.from(dt.files);
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class FileDrop {
    private options: Required<FileDropOptions>;
    public enabled: boolean = true;

    /** Map from zone element → its overlay container element */
    private overlays: Map<Element, HTMLElement> = new Map();

    /** The zone the pointer is currently inside (if any) */
    private hoveredZone: Element | null = null;

    /** Files being dragged (null when not dragging) */
    private dragFiles: File[] | null = null;

    /** Whether a drag is in progress at all */
    private isDragging: boolean = false;

    /** Bound event handlers (stored so we can remove them) */
    private handlers: Record<string, EventListener> = {};

    private events: Map<FileDropEvent, FileDropEventHandler[]> = new Map();

    constructor(options: FileDropOptions = {}) {
        this.options = resolvedOptions(options);
        this.mount();
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    public enable(): void {
        this.enabled = true;
    }

    public disable(): void {
        this.enabled = false;
        this.teardownOverlays();
    }

    public on(eventName: FileDropEvent, callback: FileDropEventHandler) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        this.events.get(eventName)!.push(callback);
        return this;
    }

    private emit(eventName: FileDropEvent, ctx: FileDropContext) {
        const handlers = this.events.get(eventName);
        if (handlers) {
            handlers.forEach(h => h(ctx));
        }
    }

    /** Permanently remove all listeners and overlays. */
    public destroy(): void {
        this.disable();
        this.unmount();
        this.events.clear();
    }

    // -------------------------------------------------------------------------
    // Default Indicators
    // -------------------------------------------------------------------------

    public static defaultPossibleIndicator(ctx: FileDropContext): Element {
        return FileDrop.createDefaultIndicator(ctx, "fd-possible",
            `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
            "Drop files here"
        );
    }

    public static defaultValidIndicator(ctx: FileDropContext): Element {
        return FileDrop.createDefaultIndicator(ctx, "fd-valid",
            `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.08V12a9 9 0 1 1-5.93-8.42"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
            "Release to upload"
        );
    }

    public static defaultInvalidIndicator(ctx: FileDropContext): Element {
        return FileDrop.createDefaultIndicator(ctx, "fd-invalid",
            `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
            "Invalid files"
        );
    }

    private static createDefaultIndicator(ctx: FileDropContext, className: string, icon: string, text: string): Element {
        const el = document.createElement("div");
        el.className = `fd-indicator ${className}`;
        if (ctx.isHovered) el.classList.add("is-hovered");
        const content = document.createElement("div");
        content.className = "fd-content";
        // svg so that text perfectly fit the container using any size (zoom in/out)
        // because css cannot do that (even cqw isn't good.)
        content.innerHTML = `
            <div class="fd-icon">${icon}</div>
            <div class="fd-text">
                <svg viewBox="0 0 200 40" preserveAspectRatio="xMidYMid meet"
                    xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
                        fill="currentColor" font-size="32" font-family="inherit"
                        textLength="190" lengthAdjust="spacingAndGlyphs">
                        ${text}
                    </text>
                </svg>
            </div>
        `;
        el.appendChild(content);
        return el;
    }

    // -------------------------------------------------------------------------
    // Event wiring
    // -------------------------------------------------------------------------

    private mount(): void {
        const add = <K extends keyof DocumentEventMap>(
            type: K,
            handler: (e: DocumentEventMap[K]) => void,
        ) => {
            const bound = handler.bind(this) as EventListener;
            this.handlers[type] = bound;
            document.addEventListener(type, bound);
        };

        if (this.options.canDragDrop) {
            add("dragenter", this.onDragEnter);
            add("dragover", this.onDragOver);
            add("dragleave", this.onDragLeave);
            add("drop", this.onDrop);
        }

        if (this.options.canPaste) {
            add("paste", this.onPaste);
        }
    }

    private unmount(): void {
        for (const [type, handler] of Object.entries(this.handlers)) {
            document.removeEventListener(type, handler);
        }
        this.handlers = {};
    }

    // -------------------------------------------------------------------------
    // Drag handlers
    // -------------------------------------------------------------------------

    private onDragEnter(e: DragEvent): void {
        if (!this.enabled) return;
        if (!this.hasFiles(e.dataTransfer)) return;

        e.preventDefault();

        if (!this.isDragging) {
            this.isDragging = true;
            // Files aren't readable until drop, so we pass null for now.
            this.dragFiles = null;

            if (this.options.showPossibleZones) {
                const zones = this.getZones(e, null);
                this.setupOverlays(zones, e, null, "possible");
            }

            this.emit('dragStart', this.buildContext({
                zone: null,
                event: e,
                files: null,
                phase: "possible",
                isHovered: false,
                allZones: this.options.showPossibleZones ? Array.from(this.overlays.keys()) : this.getZones(e, null)
            }));
        }

        // Determine if pointer is now inside a known zone.
        const target = e.target as Element;
        const zones = this.options.showPossibleZones
            ? Array.from(this.overlays.keys())
            : this.getZones(e, null);

        const entered = zones.find((z) => z.contains(target) || z === target) ?? null;

        if (entered !== this.hoveredZone) {
            const oldZone = this.hoveredZone;
            this.hoveredZone = entered;
            this.updateHoveredOverlay(entered, e, null);

            if (oldZone) {
                this.emit('leave', this.buildContext({
                    zone: oldZone,
                    event: e,
                    files: this.dragFiles,
                    phase: "possible",
                    isHovered: false,
                    allZones: zones,
                }));
            }
            if (entered) {
                this.emit('over', this.buildContext({
                    zone: entered,
                    event: e,
                    files: this.dragFiles,
                    phase: "possible",
                    isHovered: true,
                    allZones: zones,
                }));
            }
        }
    }

    private onDragOver(e: DragEvent): void {
        if (!this.enabled || !this.isDragging) return;
        if (!this.hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";

        // Update positions in case of scrolling or layout shifts
        for (const [zone, container] of this.overlays.entries()) {
            this.updateOverlayPosition(container, zone);
        }
    }

    private onDragLeave(e: DragEvent): void {
        if (!this.enabled) return;

        // relatedTarget null → left the browser window entirely.
        if (e.relatedTarget === null) {
            const oldHovered = this.hoveredZone;
            const zones = Array.from(this.overlays.keys());

            this.isDragging = false;
            this.hoveredZone = null;

            if (oldHovered) {
                this.emit('leave', this.buildContext({
                    zone: oldHovered,
                    event: e,
                    files: this.dragFiles,
                    phase: "possible",
                    isHovered: false,
                    allZones: zones,
                }));
            }

            this.emit('dragEnd', this.buildContext({
                zone: null,
                event: e,
                files: this.dragFiles,
                phase: "possible",
                isHovered: false,
                allZones: zones,
            }));

            this.teardownOverlays();
        }
    }

    private onDrop(e: DragEvent): void {
        if (!this.enabled) return;
        e.preventDefault();

        const files = extractFiles(e.dataTransfer);
        this.dragFiles = files;

        const zones = this.options.showPossibleZones
            ? Array.from(this.overlays.keys())
            : this.getZones(e, files);

        const target = e.target as Element;
        const dropped = zones.find((z) => z.contains(target) || z === target) ?? null;

        if (dropped && files.length > 0) {
            const ctx = this.buildContext({
                zone: dropped,
                event: e,
                files,
                phase: "valid",
                isHovered: true,
                allZones: zones,
            });
            const valid = this.options.isValidDrop(ctx);
            if (valid) {
                this.emit('drop', { ...ctx, isValid: true, files });
            }
        }

        const allZones = Array.from(this.overlays.keys());
        this.isDragging = false;
        this.hoveredZone = null;
        this.dragFiles = null;

        this.emit('dragEnd', this.buildContext({
            zone: null,
            event: e,
            files: null,
            phase: "possible",
            isHovered: false,
            allZones,
        }));

        this.teardownOverlays();
    }

    // -------------------------------------------------------------------------
    // Paste handler
    // -------------------------------------------------------------------------

    private onPaste(e: ClipboardEvent): void {
        if (!this.enabled) return;

        const files = e.clipboardData ? Array.from(e.clipboardData.files) : [];
        if (files.length === 0) return;

        const zones = this.getZones(e, files);
        if (zones.length === 0) return;

        // For paste, the "active" zone is the one that contains the focused element.
        const focused = document.activeElement;
        const target = focused ?? document.body;
        const zone = zones.find((z) => z.contains(target) || z === target) ?? zones[0];

        const ctx = this.buildContext({
            zone,
            event: e,
            files,
            phase: "valid",
            isHovered: true,
            allZones: zones,
        });
        const valid = this.options.isValidDrop(ctx);

        if (valid) {
            // Brief flash of overlay then drop.
            this.setupOverlays(zones, e, files, "possible");
            this.updateHoveredOverlay(zone, e, files);

            this.emit('dragStart', this.buildContext({
                zone: null,
                event: e,
                files,
                phase: "possible",
                isHovered: false,
                allZones: zones,
            }));

            requestAnimationFrame(() => {
                this.emit('drop', { ...ctx, isValid: true, files });
                this.emit('dragEnd', this.buildContext({
                    zone: null,
                    event: e,
                    files,
                    phase: "possible",
                    isHovered: false,
                    allZones: zones,
                }));
                this.teardownOverlays();
            });
        } else {
            this.setupOverlays(zones, e, files, "invalid");
            this.emit('dragStart', this.buildContext({
                zone: null,
                event: e,
                files,
                phase: "invalid",
                isHovered: false,
                allZones: zones,
            }));
            setTimeout(() => {
                this.emit('dragEnd', this.buildContext({
                    zone: null,
                    event: e,
                    files,
                    phase: "invalid",
                    isHovered: false,
                    allZones: zones,
                }));
                this.teardownOverlays();
            }, 600);
        }
    }

    // -------------------------------------------------------------------------
    // Overlay management
    // -------------------------------------------------------------------------

    /**
     * Create one overlay container per zone and render the "possible" indicator.
     */
    private setupOverlays(
        zones: Element[],
        event: DragEvent | ClipboardEvent | null,
        files: File[] | null,
        phase: FileDropContext["phase"],
    ): void {
        this.teardownOverlays();

        for (const zone of zones) {
            const container = this.createOverlayContainer(zone);
            this.overlays.set(zone, container);
            (this.options.container ?? document.body).appendChild(container);

            const ctx = this.buildContext({
                zone,
                event,
                files,
                phase,
                isHovered: false,
                allZones: zones,
            });
            this.renderIndicator(container, ctx);
        }
    }

    /**
     * Re-render the overlay for the currently hovered zone (valid/invalid).
     */
    private updateHoveredOverlay(
        hoveredZone: Element | null,
        event: DragEvent | ClipboardEvent | null,
        files: File[] | null,
    ): void {
        const allZones = Array.from(this.overlays.keys());

        for (const [zone, container] of this.overlays.entries()) {
            const isHovered = zone === hoveredZone;
            const ctx = this.buildContext({
                zone,
                event,
                files,
                phase: "possible",
                isHovered,
                allZones,
            });

            const valid = files !== null ? this.options.isValidDrop(ctx) : null;
            const phase: FileDropContext["phase"] =
                isHovered && valid !== null
                    ? (valid ? "valid" : "invalid")
                    : "possible";

            this.renderIndicator(container, { ...ctx, phase, isValid: valid });
        }
    }

    /** Remove all overlay containers from the DOM. */
    private teardownOverlays(): void {
        for (const container of this.overlays.values()) {
            container.remove();
        }
        this.overlays.clear();
    }

    // -------------------------------------------------------------------------
    // DOM helpers
    // -------------------------------------------------------------------------

    private createOverlayContainer(zone: Element): HTMLElement {
        const el = document.createElement("div");

        Object.assign(el.style, {
            pointerEvents: "none",
            zIndex: "2147483647",
            boxSizing: "border-box",
            overflow: "hidden",
        } satisfies Partial<CSSStyleDeclaration>);

        return el;
    }

    /** Clear and re-populate a container with the appropriate indicator element. */
    private renderIndicator(container: HTMLElement, ctx: FileDropContext): void {
        if (!ctx.zone) return;
        this.updateOverlayPosition(container, ctx.zone);
        container.innerHTML = "";

        const { phase } = ctx;
        const indicatorFn =
            phase === "possible" ? this.options.possibleDropZoneIndicatorElem :
                phase === "valid" ? this.options.validDropZoneIndicatorElem :
                    this.options.invalidDropZoneIndicatorElem;

        const indicator = indicatorFn(ctx);
        if (indicator instanceof HTMLElement || indicator instanceof SVGElement) {
            indicator.style.width = "100%";
            indicator.style.height = "100%";
            container.appendChild(indicator);
        } else if (indicator) {
            container.appendChild(indicator);
        }
    }

    private updateOverlayPosition(container: HTMLElement, zone: Element): void {
        const rect = zone.getBoundingClientRect();
        const padding = this.options.indicatorPadding;

        Object.assign(container.style, {
            position: "fixed",
            top: `${rect.top - padding}px`,
            left: `${rect.left - padding}px`,
            width: `${rect.width + 2 * (padding)}px`,
            height: `${rect.height + 2 * (padding)}px`,
        });
    }

    // -------------------------------------------------------------------------
    // Context helpers
    // -------------------------------------------------------------------------

    private buildContext(
        partial: Omit<FileDropContext, "zoneBounds" | "isValid" | "container" | "self"> & {
            isValid?: boolean | null;
            container?: HTMLElement | null;
        },
    ): FileDropContext {
        const zone = partial.zone;
        return {
            ...partial,
            self: this,
            zoneBounds: zone ? zone.getBoundingClientRect() : null,
            isValid: partial.isValid ?? null,
            container: partial.container ?? (zone ? this.overlays.get(zone) : null) ?? null,
        };
    }

    private getZones(
        event: DragEvent | ClipboardEvent,
        files: File[] | null,
    ): Element[] {
        const baseCtx = {
            self: this,
            event,
            files,
            isValid: null,
        };

        return this.options.allowedZones(baseCtx as any);
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    private hasFiles(dt: DataTransfer | null): boolean {
        if (!dt) return false;
        return (
            dt.types.includes("Files") ||
            Array.from(dt.items).some((i) => i.kind === "file")
        );
    }
}