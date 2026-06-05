import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './BoneRetargeting.css';

export interface BoneRetargetingBone {
    x: number; // percentage (0-100) or normalized (0-1)
    y: number;
    name: string;
}

export interface BoneRetargetingReference {
    imageUrl: string;
    bones: BoneRetargetingBone[];
}

export interface BoneRetargetingOptions {
    container?: HTMLElement;
    model?: THREE.Object3D | null;
    reference: BoneRetargetingReference;
}

export class BoneRetargeting {
    private options: BoneRetargetingOptions;
    private root: HTMLDivElement;
    private leftPanel: HTMLDivElement;
    private rightPanel: HTMLDivElement;
    private leftOverlay: HTMLDivElement;
    private rightOverlay: HTMLDivElement;
    private imageContainer: HTMLDivElement;
    private statusText: HTMLSpanElement;
    private useSymmetry: boolean = false;

    // ThreeJS Context
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private controls: OrbitControls;
    private renderer: THREE.WebGLRenderer;
    private rendererContainer: HTMLDivElement;

    // Models & Bones State
    private currentModel: THREE.Object3D | null = null;
    private modelBones: THREE.Object3D[] = [];
    private mapping: Record<string, string> = {}; // refBoneName -> modelBoneName
    private imageAspectRatio: number | null = null;

    // UI interactive mapping states
    private selectedRefBone: string | null = null;
    private selectedModelBone: string | null = null;

    private refPoints: Map<string, HTMLDivElement> = new Map();
    private modelPoints: Map<string, HTMLDivElement> = new Map();

    private frameId: number | null = null;
    private resizeObserver: ResizeObserver | null = null;

    constructor(options: BoneRetargetingOptions) {
        this.options = options;

        // Create main container
        this.root = document.createElement('div');
        this.root.className = 'retarget-container';

        // 1. Top Toolbar spanning full width
        const toolbar = document.createElement('div');
        toolbar.className = 'retarget-toolbar';

        this.statusText = document.createElement('span');
        this.statusText.className = 'retarget-info-text';
        this.statusText.innerHTML = 'Select a bone on either side to start retargeting.';
        toolbar.appendChild(this.statusText);

        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'retarget-toolbar-controls';

        // Symmetry Toggle
        const symmetryLabel = document.createElement('label');
        symmetryLabel.className = 'retarget-symmetry-label';

        const symmetryCheckbox = document.createElement('input');
        symmetryCheckbox.type = 'checkbox';
        symmetryCheckbox.checked = false;
        symmetryCheckbox.onchange = (e) => {
            this.useSymmetry = (e.target as HTMLInputElement).checked;
            if (this.useSymmetry) {
                if (this.selectedRefBone && this.isLeftBone(this.selectedRefBone)) this.selectedRefBone = null;
                if (this.selectedModelBone && this.isLeftBone(this.selectedModelBone)) this.selectedModelBone = null;
                this.updateActiveStyles();
                this.updateStatusText();
            }
            this.updateSymmetryVisibility();
            this.updateProjections();
        };

        const symmetryText = document.createTextNode(' Use Symmetry');
        symmetryLabel.appendChild(symmetryCheckbox);
        symmetryLabel.appendChild(symmetryText);
        controlsContainer.appendChild(symmetryLabel);

        // Clear All Button
        const clearBtn = document.createElement('button');
        clearBtn.className = 'retarget-btn';
        clearBtn.textContent = 'Clear All';
        clearBtn.onclick = () => this.clearAllMappings();
        controlsContainer.appendChild(clearBtn);

        // Download Button
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'retarget-btn retarget-btn-primary';
        downloadBtn.textContent = 'Download Map';
        downloadBtn.onclick = () => this.downloadMap();
        controlsContainer.appendChild(downloadBtn);

        toolbar.appendChild(controlsContainer);
        this.root.appendChild(toolbar);

        // Panels Wrapper
        const panelsWrapper = document.createElement('div');
        panelsWrapper.className = 'retarget-panels-wrapper';
        this.root.appendChild(panelsWrapper);

        // 2. Left Panel (3D Render + Projected points)
        this.leftPanel = document.createElement('div');
        this.leftPanel.className = 'retarget-panel retarget-panel-left';

        this.rendererContainer = document.createElement('div');
        this.rendererContainer.className = 'retarget-renderer-container';
        this.leftPanel.appendChild(this.rendererContainer);

        this.leftOverlay = document.createElement('div');
        this.leftOverlay.className = 'retarget-overlay';
        this.leftPanel.appendChild(this.leftOverlay);

        panelsWrapper.appendChild(this.leftPanel);

        // 3. Right Panel (Reference image + Reference points)
        this.rightPanel = document.createElement('div');
        this.rightPanel.className = 'retarget-panel retarget-panel-right';

        this.imageContainer = document.createElement('div');
        this.imageContainer.className = 'retarget-image-container';
        if (options.reference.imageUrl) {
            this.imageContainer.style.backgroundImage = `url('${options.reference.imageUrl}')`;

            const img = new Image();
            img.src = options.reference.imageUrl;
            img.onload = () => {
                this.imageAspectRatio = img.width / img.height;
                this.updateRightPanelLayout();
            };
        }
        this.rightPanel.appendChild(this.imageContainer);

        this.rightOverlay = document.createElement('div');
        this.rightOverlay.className = 'retarget-overlay';
        this.imageContainer.appendChild(this.rightOverlay);

        panelsWrapper.appendChild(this.rightPanel);

        const r = this.rightPanel;
        const coordsDisplay = document.createElement('div');
        coordsDisplay.className = 'retarget-coords-display';
        coordsDisplay.style.position = 'absolute';
        coordsDisplay.style.top = '10px';
        coordsDisplay.style.left = '10px';
        coordsDisplay.style.padding = '6px 10px';
        coordsDisplay.style.background = 'rgba(20, 20, 20, 0.85)';
        coordsDisplay.style.color = '#00ffcc';
        coordsDisplay.style.fontFamily = 'monospace';
        coordsDisplay.style.fontSize = '12px';
        coordsDisplay.style.borderRadius = '4px';
        coordsDisplay.style.border = '1px solid rgba(0, 255, 204, 0.3)';
        coordsDisplay.style.pointerEvents = 'none';
        coordsDisplay.style.zIndex = '10';
        coordsDisplay.textContent = 'X: 0.000, Y: 0.000';
        r.appendChild(coordsDisplay);

        r.addEventListener('mousemove', e => {
            const rect = this.imageContainer.getBoundingClientRect();
            const xVal = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const yVal = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            const x = xVal.toFixed(3);
            const y = yVal.toFixed(3);
            coordsDisplay.textContent = `X: ${x}, Y: ${y}`;
        });

        // Initialize Three.js scene
        this.initThree();

        // Render reference bone points
        this.renderReferencePoints();

        // If container option is provided, append root to it
        if (options.container) {
            options.container.appendChild(this.root);
        }

        // Set initial model if present
        if (options.model) {
            this.setModel(options.model);
        }

        // Start render / update loops
        this.startLoop();

        // Setup resize detection
        this.resizeObserver = new ResizeObserver(() => {
            this.onResize();
        });
        this.resizeObserver.observe(this.root);
    }

    /**
     * Initializes the ThreeJS scene, camera, and WebGLRenderer.
     */
    private initThree(): void {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0c0c0c);

        // Perspective camera
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        this.camera.position.set(0, 2, 5);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(0, 1, 1).normalize();
        this.scene.add(dirLight);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.rendererContainer.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
    }

    /**
     * Renders/Positions the reference bones on the right panel.
     */
    private renderReferencePoints(): void {
        this.rightOverlay.innerHTML = '';
        this.refPoints.clear();

        this.options.reference.bones.forEach((bone) => {
            const pt = document.createElement('div');
            pt.className = 'retarget-point';

            // Interpret x, y as percentages (multiply by 100 if <= 1)
            const px = bone.x <= 1 ? bone.x * 100 : bone.x;
            const py = bone.y <= 1 ? bone.y * 100 : bone.y;

            pt.style.left = `${px}%`;
            pt.style.top = `${py}%`;

            const label = document.createElement('div');
            label.className = 'retarget-point-label';
            label.textContent = bone.name;
            pt.appendChild(label);

            pt.onclick = (e) => {
                e.stopPropagation();
                this.handleRefBoneClick(bone.name);
            };

            pt.onmouseenter = () => {
                const mappedModel = this.mapping[bone.name];
                if (mappedModel) {
                    const modelPt = this.modelPoints.get(mappedModel);
                    if (modelPt) modelPt.classList.add('hover-linked');
                }
            };

            pt.onmouseleave = () => {
                const mappedModel = this.mapping[bone.name];
                if (mappedModel) {
                    const modelPt = this.modelPoints.get(mappedModel);
                    if (modelPt) modelPt.classList.remove('hover-linked');
                }
            };

            this.rightOverlay.appendChild(pt);
            this.refPoints.set(bone.name, pt);
        });

        this.updateSymmetryVisibility();
    }

    /**
     * Sets/Swaps the 3D model.
     */
    public setModel(model: THREE.Object3D | null): void {
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
        }

        this.leftOverlay.innerHTML = '';
        this.modelPoints.clear();
        this.modelBones = [];

        if (model) {
            const cloned = model.clone();

            // Correctly remap skeleton bones to the cloned hierarchy to decouple from the original model's animation
            const originalBones: THREE.Object3D[] = [];
            model.traverse((child) => {
                if (child.type === 'Bone' || (child as any).isBone) {
                    originalBones.push(child);
                }
            });

            const clonedBones: THREE.Object3D[] = [];
            cloned.traverse((child) => {
                if (child.type === 'Bone' || (child as any).isBone) {
                    clonedBones.push(child);
                }
            });

            cloned.traverse((child) => {
                if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
                    const mesh = child as THREE.SkinnedMesh;
                    if (mesh.skeleton) {
                        const newBones: THREE.Bone[] = [];
                        for (let i = 0; i < mesh.skeleton.bones.length; i++) {
                            const originalBone = mesh.skeleton.bones[i];
                            const idx = originalBones.indexOf(originalBone);
                            if (idx !== -1 && idx < clonedBones.length) {
                                newBones.push(clonedBones[idx] as THREE.Bone);
                            } else {
                                const nameMatch = clonedBones.find(cb => cb.name === originalBone.name);
                                if (nameMatch) {
                                    newBones.push(nameMatch as THREE.Bone);
                                } else {
                                    const dummy = new THREE.Bone();
                                    dummy.name = originalBone.name;
                                    newBones.push(dummy);
                                }
                            }
                        }
                        mesh.bind(new THREE.Skeleton(newBones, mesh.skeleton.boneInverses.map(m => m.clone())));
                    }
                    mesh.pose(); // Reset to bind pose
                }
            });

            this.currentModel = cloned;
            this.scene.add(cloned);

            // Traverse and extract bones
            this.modelBones = this.findBones(cloned);

            // Create circular indicators for each model bone
            this.modelBones.forEach((bone) => {
                const pt = document.createElement('div');
                pt.className = 'retarget-point';

                const label = document.createElement('div');
                label.className = 'retarget-point-label';
                label.textContent = bone.name;
                pt.appendChild(label);

                pt.onclick = (e) => {
                    e.stopPropagation();
                    this.handleModelBoneClick(bone.name);
                };

                pt.onmouseenter = () => {
                    // Find if any reference bone is mapped to this model bone
                    const refName = Object.keys(this.mapping).find(k => this.mapping[k] === bone.name);
                    if (refName) {
                        const refPt = this.refPoints.get(refName);
                        if (refPt) refPt.classList.add('hover-linked');
                    }
                };

                pt.onmouseleave = () => {
                    const refName = Object.keys(this.mapping).find(k => this.mapping[k] === bone.name);
                    if (refName) {
                        const refPt = this.refPoints.get(refName);
                        if (refPt) refPt.classList.remove('hover-linked');
                    }
                };

                this.leftOverlay.appendChild(pt);
                this.modelPoints.set(bone.name, pt);
            });

            // Adjust model visual scale/fit camera orthographically
            this.fitCameraToModel();
            this.updateMappedStatuses();
        }

        this.updateStatusText();
    }

    /**
     * Finds bones within the 3D model.
     */
    private findBones(model: THREE.Object3D): THREE.Object3D[] {
        const bones: THREE.Object3D[] = [];
        model.traverse((child) => {
            if (child.type === 'Bone' || (child as any).isBone) {
                if (!bones.includes(child)) bones.push(child);
            }
        });
        if (bones.length === 0) {
            // SkinnedMesh fallback
            model.traverse((child) => {
                if ((child as THREE.SkinnedMesh).isSkinnedMesh && (child as THREE.SkinnedMesh).skeleton) {
                    (child as THREE.SkinnedMesh).skeleton.bones.forEach((b) => {
                        if (!bones.includes(b)) bones.push(b);
                    });
                }
            });
        }
        if (bones.length === 0) {
            // Match typical naming conventions if no Bone types exist
            model.traverse((child) => {
                const lower = child.name.toLowerCase();
                if (lower.includes('hip') || lower.includes('spine') || lower.includes('chest') || lower.includes('neck') || lower.includes('head') || lower.includes('arm') || lower.includes('leg') || lower.includes('foot') || lower.includes('shoulder') || lower.includes('hand')) {
                    if (!bones.includes(child)) bones.push(child);
                }
            });
        }
        return bones;
    }

    /**
     * Centers and scales the orthographic camera.
     */
    private fitCameraToModel(): void {
        if (!this.currentModel) return;

        const box = new THREE.Box3().setFromObject(this.currentModel);
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const aspect = this.leftPanel.clientWidth / (this.leftPanel.clientHeight || 1);

        this.camera.aspect = aspect;

        // Position camera looking directly front (positive Z towards negative Z)
        const distance = maxDim * 1.5;
        this.camera.position.set(center.x, center.y, center.z + distance);
        this.camera.lookAt(center);

        if (this.controls) {
            this.controls.target.copy(center);
            this.controls.update();
        }

        this.camera.updateProjectionMatrix();
    }

    /**
     * Maps coordinate positions of bones to screen coordinates.
     */
    private updateProjections(): void {
        if (!this.currentModel || this.modelBones.length === 0) return;

        const width = this.leftPanel.clientWidth;
        const height = this.leftPanel.clientHeight;
        if (width === 0 || height === 0) return;

        this.camera.updateMatrixWorld();

        const tempV = new THREE.Vector3();
        this.modelBones.forEach((bone) => {
            bone.getWorldPosition(tempV);
            tempV.project(this.camera);

            const px = (tempV.x * 0.5 + 0.5) * 100;
            const py = (-(tempV.y * 0.5) + 0.5) * 100;

            const pt = this.modelPoints.get(bone.name);
            if (pt) {
                pt.style.left = `${px}%`;
                pt.style.top = `${py}%`;

                const isLeft = this.isLeftBone(bone.name);
                const isClipped = tempV.z < -1 || tempV.z > 1;
                pt.style.display = (isClipped || (this.useSymmetry && isLeft)) ? 'none' : 'block';
            }
        });
    }

    /**
     * Click handlers for points
     */
    private handleRefBoneClick(refName: string): void {
        // Toggle selected state
        if (this.selectedRefBone === refName) {
            this.selectedRefBone = null;
        } else if (this.selectedModelBone) {
            // Map the selected model bone to this reference bone
            this.establishMapping(refName, this.selectedModelBone);
            this.selectedModelBone = null;
            this.selectedRefBone = null;
        } else {
            this.selectedRefBone = refName;
        }
        this.updateActiveStyles();
        this.updateStatusText();
    }

    private handleModelBoneClick(modelName: string): void {
        if (this.selectedModelBone === modelName) {
            this.selectedModelBone = null;
        } else if (this.selectedRefBone) {
            // Map this model bone to the selected reference bone
            this.establishMapping(this.selectedRefBone, modelName);
            this.selectedRefBone = null;
            this.selectedModelBone = null;
        } else {
            this.selectedModelBone = modelName;
        }
        this.updateActiveStyles();
        this.updateStatusText();
    }

    private establishMapping(refName: string, modelName: string): void {
        // Remove old mapping references to this model bone if it was mapped elsewhere
        Object.keys(this.mapping).forEach((k) => {
            if (this.mapping[k] === modelName) {
                delete this.mapping[k];
            }
        });

        // Save mapping
        this.mapping[refName] = modelName;
        this.updateMappedStatuses();
    }

    private updateMappedStatuses(): void {
        // Reset styles first
        this.refPoints.forEach((pt) => pt.classList.remove('mapped'));
        this.modelPoints.forEach((pt) => pt.classList.remove('mapped'));

        // Highlight mapped elements
        Object.entries(this.mapping).forEach(([refName, modelName]) => {
            const refPt = this.refPoints.get(refName);
            if (refPt) refPt.classList.add('mapped');

            const modelPt = this.modelPoints.get(modelName);
            if (modelPt) modelPt.classList.add('mapped');
        });
    }

    private updateActiveStyles(): void {
        // Clear active class
        this.refPoints.forEach((pt) => pt.classList.remove('active'));
        this.modelPoints.forEach((pt) => pt.classList.remove('active'));

        if (this.selectedRefBone) {
            const pt = this.refPoints.get(this.selectedRefBone);
            if (pt) pt.classList.add('active');
        }

        if (this.selectedModelBone) {
            const pt = this.modelPoints.get(this.selectedModelBone);
            if (pt) pt.classList.add('active');
        }
    }

    private updateStatusText(): void {
        if (this.selectedRefBone) {
            this.statusText.innerHTML = `Selected reference bone: <span class="retarget-info-highlight">${this.selectedRefBone}</span>. Click equivalent bone on the model.`;
        } else if (this.selectedModelBone) {
            this.statusText.innerHTML = `Selected model bone: <span class="retarget-info-highlight">${this.selectedModelBone}</span>. Click equivalent bone on the reference.`;
        } else {
            const mappedCount = Object.keys(this.mapping).length;
            this.statusText.innerHTML = `Mapped <span class="retarget-info-highlight">${mappedCount}</span> bone(s). Click any bone circle to map.`;
        }
    }

    private clearAllMappings(): void {
        this.mapping = {};
        this.selectedRefBone = null;
        this.selectedModelBone = null;
        this.updateActiveStyles();
        this.updateMappedStatuses();
        this.updateStatusText();
    }

    /**
     * Helper to check if a bone name belongs to the left side by parsing its name.
     */
    private isLeftBone(name: string): boolean {
        const cleaned = name.replace(/([a-z])([A-Z])/g, '$1 $2');
        const tokens = cleaned.toLowerCase().split(/[^a-z0-9]+/);
        return tokens.includes('l') || tokens.includes('left');
    }

    /**
     * Updates visibility of reference points based on the symmetry toggle.
     */
    private updateSymmetryVisibility(): void {
        this.options.reference.bones.forEach((bone) => {
            const pt = this.refPoints.get(bone.name);
            if (pt) {
                const isLeft = this.isLeftBone(bone.name);
                pt.style.display = (this.useSymmetry && isLeft) ? 'none' : 'block';
            }
        });
    }

    /**
     * Downloads the current mapping as a JSON file.
     */
    private downloadMap(): void {
        const blob = new Blob([JSON.stringify(this.getMap(), null, 4)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bone-map.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Helper to compute the mirrored counterpart for a bone name.
     */
    private getSymmetricBoneName(name: string): string {
        let sym = name;
        if (/right/i.test(sym)) {
            sym = sym.replace(/right/g, 'left').replace(/Right/g, 'Left').replace(/RIGHT/g, 'LEFT');
        } else if (/left/i.test(sym)) {
            sym = sym.replace(/left/g, 'right').replace(/Left/g, 'Right').replace(/LEFT/g, 'RIGHT');
        } else if (/_R\b/.test(sym)) {
            sym = sym.replace(/_R\b/g, '_L');
        } else if (/_L\b/.test(sym)) {
            sym = sym.replace(/_L\b/g, '_R');
        } else if (/_r\b/.test(sym)) {
            sym = sym.replace(/_r\b/g, '_l');
        } else if (/_l\b/.test(sym)) {
            sym = sym.replace(/_l\b/g, '_r');
        } else if (/\.R\b/.test(sym)) {
            sym = sym.replace(/\.R\b/g, '.L');
        } else if (/\.L\b/.test(sym)) {
            sym = sym.replace(/\.L\b/g, '.R');
        } else if (/\.r\b/.test(sym)) {
            sym = sym.replace(/\.r\b/g, '.l');
        } else if (/\.l\b/.test(sym)) {
            sym = sym.replace(/\.l\b/g, '.r');
        } else if (/\bR_/.test(sym)) {
            sym = sym.replace(/\bR_/g, 'L_');
        } else if (/\bL_/.test(sym)) {
            sym = sym.replace(/\bL_/g, 'R_');
        } else if (/\br_/.test(sym)) {
            sym = sym.replace(/\br_/g, 'l_');
        } else if (/\bl_/.test(sym)) {
            sym = sym.replace(/\bl_/g, 'r_');
        } else if (/\bR\b/.test(sym)) {
            sym = sym.replace(/\bR\b/g, 'L');
        } else if (/\bL\b/.test(sym)) {
            sym = sym.replace(/\bL\b/g, 'R');
        } else if (/\br\b/.test(sym)) {
            sym = sym.replace(/\br\b/g, 'l');
        } else if (/\bl\b/.test(sym)) {
            sym = sym.replace(/\bl\b/g, 'r');
        }
        return sym;
    }

    /**
     * Returns the current map object: { reference_bone_name: model_bone_name }
     */
    public getMap(): Record<string, string> {
        const result = { ...this.mapping };
        if (this.useSymmetry) {
            Object.entries(this.mapping).forEach(([refName, modelName]) => {
                const symRef = this.getSymmetricBoneName(refName);
                const symModel = this.getSymmetricBoneName(modelName);
                if (symRef !== refName && symModel !== modelName) {
                    result[symRef] = symModel;
                }
            });
        }
        return result;
    }

    public getContainer(): HTMLDivElement {
        return this.root;
    }
    public getLeftPanel(): HTMLDivElement {
        return this.leftPanel;
    }
    public getRightPanel(): HTMLDivElement {
        return this.rightPanel;
    }

    private startLoop(): void {
        const tick = () => {
            this.frameId = requestAnimationFrame(tick);
            this.updateProjections();
            if (this.controls) {
                this.controls.update();
            }
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        };
        tick();
    }

    private onResize(): void {
        const width = this.leftPanel.clientWidth;
        const height = this.leftPanel.clientHeight;
        if (this.renderer) {
            this.renderer.setSize(width, height);
        }
        this.fitCameraToModel();
        this.updateRightPanelLayout();
    }

    private updateRightPanelLayout(): void {
        if (!this.imageAspectRatio) return;
        const parentWidth = this.rightPanel.clientWidth;
        const parentHeight = this.rightPanel.clientHeight;
        if (parentWidth === 0 || parentHeight === 0) return;

        const parentAspect = parentWidth / parentHeight;
        let width = 0;
        let height = 0;

        if (parentAspect > this.imageAspectRatio) {
            // Panel is wider than image aspect ratio -> fit to height (pillarbox)
            height = parentHeight;
            width = height * this.imageAspectRatio;
        } else {
            // Panel is taller than image aspect ratio -> fit to width (letterbox)
            width = parentWidth;
            height = width / this.imageAspectRatio;
        }

        this.imageContainer.style.width = `${width}px`;
        this.imageContainer.style.height = `${height}px`;
    }

    public destroy(): void {
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.controls) {
            this.controls.dispose();
        }
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement.parentElement) {
                this.renderer.domElement.remove();
            }
        }
        this.root.remove();
    }
}
