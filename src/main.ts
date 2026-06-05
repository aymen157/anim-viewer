import { GoldenLayout, LayoutConfig, ComponentContainer } from 'golden-layout';
import 'golden-layout/dist/css/goldenlayout-base.css';
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader, GLTFLoader, OBJLoader, type GLTF } from 'three/examples/jsm/Addons.js';
import { Box3, Vector3, type Object3D } from 'three';
import { AnimationLibrary, type AnimationLibraryButton } from './components/AnimationLibrary';
import './components/AnimationLibrary.css';
import { FileDrop } from './components/FileDrop';
import './components/FileDrop.css'
import { AddonShelf } from './components/AddonShelf';
import { BoneRetargeting } from './components/BoneRetargeting';
import { getHumanReference } from './components/HumanReference';
declare var API: any

const appConfig = {
    defaultModelUrl: `/anime_big_breast_OP_Y_IK.fbx`,
    defaultModelSize: 5,
    animationsFolder: '../animations',
    thumbnailsFolder: '../animations_thumbs',
    animButtons: [
        {
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
            title: 'Open in Explorer',
            onClick: (ctx) => {
                const { animPath } = ctx.card.data;
                if (animPath) {
                    API.openFolder(animPath);
                }
            }
        },
        {
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
            title: 'Open Manifest in Explorer',
            onClick: (ctx) => {
                const { manifestPath } = ctx.card.data;
                if (manifestPath) {
                    API.openFolder(manifestPath);
                }
            }
        }
    ] as AnimationLibraryButton[],
}

let currentModel: THREE.Object3D | null = null;
let lastMeshPath: string | null = null;
let retargetInstance: BoneRetargeting | null = null;
let mixer: THREE.AnimationMixer | null = null;
const clock = new THREE.Clock();

// Helper to load file via API and create a Blob URL for Three.js loaders
async function getFileURL(path: string): Promise<string> {

    const res = await API.readFile(path);
    // If it's a Buffer object from Express/Node.js
    if (res && res.type === 'Buffer' && Array.isArray(res.data)) {
        const uint8 = new Uint8Array(res.data);
        const blob = new Blob([uint8]);
        return URL.createObjectURL(blob);
    }
    // Fallback if it's already a string or other format
    if (typeof res === 'string') {
        const blob = new Blob([res]);
        return URL.createObjectURL(blob);
    }
    throw new Error(`Failed to read file at ${path} as binary`);
}
const layoutConfig: LayoutConfig = {
    header: {
        popout: false
    },
    root: {
        type: 'row',
        content: [
            {
                type: 'stack',
                width: 25,
                content: [
                    {
                        type: 'component',
                        componentType: 'library',
                        componentState: {},
                        isClosable: false,
                    },
                    {
                        type: 'component',
                        componentType: 'addons',
                        componentState: {},
                        isClosable: false
                    },
                ]
            },

            {
                type: 'stack',
                width: 75,
                content: [
                    {
                        type: 'component',
                        componentType: 'world',
                        componentState: {},
                        isClosable: false,
                    },
                    {
                        type: 'component',
                        componentType: 'retarget',
                        componentState: {},
                        isClosable: false,
                    }
                ]
            }
        ]
    }
};


// const fdrop = new FileDrop({
//     container: document.body,
//     indicatorPadding: 0,
//     allowedZones: () => Array.from(document.querySelectorAll('#app')),
// }).on('drop', ({ files, zone }) => {
//     if (!files || files.length === 0) return;
//     const url = URL.createObjectURL(files[0]);
// });


// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 10);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.domElement.style.backgroundColor = 'black'

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;     // smaller = slower damping (0.01–0.2 typical)
controls.rotateSpeed = 1.0;        // default is 1.0, increase to make orbit faster
controls.zoomSpeed = 2;          // default is 1.0, increase to zoom faster
controls.panSpeed = 1.0;           // controls panning speed
controls.target.set(0, appConfig.defaultModelSize * .8, 0);

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// Grid
// scene.add(new THREE.GridHelper(20, 20, 0xff0000, 0xffd700));
const gridMaterial = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
        uColor: { value: new THREE.Color(0xffd700) },
        uFadeDistance: { value: 120.0 },
        uCellSize: { value: 1.0 },
        uSectionSize: { value: 10.0 }
    },
    vertexShader: `
    varying vec3 vWorldPosition;

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;

      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
    fragmentShader: `
    varying vec3 vWorldPosition;

    uniform vec3 uColor;
    uniform float uFadeDistance;
    uniform float uCellSize;
    uniform float uSectionSize;

    float gridLine(float size) {
      vec2 r = vWorldPosition.xz / size;
      vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
      return 1.0 - min(min(grid.x, grid.y), 1.0);
    }

    void main() {
      float smallGrid = gridLine(uCellSize) * 0.4;
      float largeGrid = gridLine(uSectionSize);

      float grid = max(smallGrid, largeGrid);

      float dist = length(cameraPosition.xz - vWorldPosition.xz);
      float fade = 1.0 - smoothstep(0.0, uFadeDistance, dist);

      gl_FragColor = vec4(uColor, grid * fade);

      if (gl_FragColor.a <= 0.01) discard;
    }
  `
});

const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    gridMaterial
);

grid.rotation.x = -Math.PI / 2;
scene.add(grid);
// To make it feel truly infinite, move the grid with the camera each frame:
// grid.position = camera.position;



// Shared state for custom addon buttons
let activeLibraryInstance: AnimationLibrary | null = null;
const loadedCustomButtons = AddonShelf.loadButtons();
let customButtons: AnimationLibraryButton[] = AddonShelf.compileButtons(loadedCustomButtons);

function updateLibraryButtons() {
    if (activeLibraryInstance) {
        activeLibraryInstance.setButtons([...appConfig.animButtons, ...customButtons]);
    }
}

// setup layout
const container = document.getElementById('app') as HTMLElement;
const layout = new GoldenLayout(container);

layout.registerComponentFactoryFunction('addons', (container: ComponentContainer) => {
    const shelf = new AddonShelf({
        container: container.element as HTMLElement,
        onButtonsChanged: (newButtons: AnimationLibraryButton[]) => {
            customButtons = newButtons;
            updateLibraryButtons();
        }
    });
});

layout.registerComponentFactoryFunction('library', async (container: ComponentContainer) => {
    const lib = new AnimationLibrary({
        container: container.element as HTMLElement,
        buttons: [...appConfig.animButtons, ...customButtons]
    });
    activeLibraryInstance = lib;

    // 1. Find all manifests
    const manifestFiles = await API.walkdir(appConfig.animationsFolder, { wildcard: ["**/manifest.json", "**/*.manifest.json"] });
    console.log('Found manifests:', manifestFiles);

    const allCards: any[] = [];

    // 2. Process each manifest
    for (const manifestPath of manifestFiles) {
        try {
            const content = await API.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(content);
            const manifestDir = await API.dirname(manifestPath);

            const patterns = Array.isArray(manifest.animations) ? manifest.animations : [manifest.animations];
            const ignorePatterns = manifest.not_animations || [];

            for (const pattern of patterns) {
                // Glob animations using walkdir + wildcard + ignore
                const animFiles = await API.walkdir(manifestDir, {
                    wildcard: pattern,
                    ignore: ignorePatterns
                });

                for (const animPath of animFiles) {
                    // OPTIMIZATION: Use local string manipulation instead of API.basename 
                    // to avoid 20,000+ network roundtrips.
                    const name = animPath.split(/[\\/]/).pop() || animPath;

                    allCards.push({
                        src: null,
                        name: name,
                        data: {
                            animPath,
                            manifest,
                            manifestDir,
                            manifestPath
                        }
                    });
                }
            }
        } catch (err) {
            console.error(`Error processing manifest at ${manifestPath}:`, err);
        }
    }

    lib.setCards(allCards);

    // 3. Handle card click
    lib.on('cardClick', async (ctx) => {
        const { animPath, manifest, manifestDir } = ctx.card.data;
        console.log('Loading animation:', ctx.card.name);

        try {
            // Load the original mesh from the manifest
            const meshRel = manifest.mesh.replace(/^\.\//, '');
            const meshPath = `${manifestDir}/${meshRel}`.replace(/\\/g, '/');

            // OPTIMIZATION: Only load mesh if it's different from the last one
            if (meshPath !== lastMeshPath) {
                console.log('Loading new mesh:', meshPath);
                const meshUrl = await getFileURL(meshPath);
                const model = await loadModel(meshUrl, 'fbx');

                // Swap model in scene
                if (currentModel) scene.remove(currentModel);
                currentModel = model;
                scene.add(model);
                setModelSize(model, appConfig.defaultModelSize);
                lastMeshPath = meshPath;

                // Reset mixer for new model
                if (mixer) {
                    mixer.stopAllAction();
                    mixer = null;
                }

                if (retargetInstance) {
                    retargetInstance.setModel(currentModel);
                }
            }

            // Load the animation FBX
            const animUrl = await getFileURL(animPath);
            const animGroup = await loadModel(animUrl, 'fbx') as any;

            if (animGroup.animations && animGroup.animations.length > 0) {
                if (mixer) mixer.stopAllAction();
                mixer = new THREE.AnimationMixer(currentModel!);
                const action = mixer.clipAction(animGroup.animations[0]);
                action.play();
                console.log('Playing animation:', animGroup.animations[0].name);
            } else {
                console.warn('No animations found in:', animPath);
            }
        } catch (err) {
            console.error('Failed to load mesh or animation:', err);
        }
    });
});
layout.registerComponentFactoryFunction('world', (container: ComponentContainer) => {
    container.element.appendChild(renderer.domElement);
});
layout.registerComponentFactoryFunction('retarget', (container: ComponentContainer) => {
    retargetInstance = new BoneRetargeting({
        container: container.element as HTMLElement,
        model: currentModel,
        reference: getHumanReference()
    });
    new FileDrop({
        container: document.body,
        allowedZones: (e) => [retargetInstance.getLeftPanel()]
    }).on('drop', async e => {
        const file = e.files[0];
        const ext = file.name.split('.').pop()
        const model = await loadModel(URL.createObjectURL(file), ext);
        retargetInstance.setModel(model);
    })
});
layout.loadLayout(layoutConfig);
window.addEventListener('resize', () => layout.setSize(window.innerWidth, window.innerHeight));

// Dynamic loader
async function loadModel(filePath: string, overrideExt?: string): Promise<Object3D> {
    const ext = overrideExt ? overrideExt.toLocaleLowerCase() :
        filePath.split(".").pop()?.toLowerCase();

    if (!ext) {
        throw new Error("Missing file extension");
    }

    if (ext === "fbx") {
        const loader = new FBXLoader();
        return await new Promise<Object3D>((resolve, reject) => {
            loader.load(filePath, resolve, undefined, reject);
        });
    }

    if (ext === "obj") {
        const loader = new OBJLoader();
        return await new Promise<Object3D>((resolve, reject) => {
            loader.load(filePath, resolve, undefined, reject);
        });
    }

    if (ext === "gltf" || ext === "glb") {
        const loader = new GLTFLoader();
        const gltf = await new Promise<GLTF>((resolve, reject) => {
            loader.load(filePath, resolve, undefined, reject);
        });
        return gltf.scene;
    }

    throw new Error(`Unsupported file extension: ${ext}`);
}

function setModelSize(model: Object3D, newSize: number, axis: Vector3 = new Vector3(0, 1, 0)): Object3D {
    const bbox = new Box3().setFromObject(model);
    const size = new Vector3();
    bbox.getSize(size);
    const axisLength = size.dot(axis.clone().normalize());
    if (axisLength === 0) return model;
    const scaleFactor = newSize / axisLength;
    model.scale.multiplyScalar(scaleFactor);
    return model;
}


async function update() { // a single tick
    requestAnimationFrame(update);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    controls.update();
    renderer.render(scene, camera);
}

async function main() {
    const default_model = await loadModel(appConfig.defaultModelUrl)
    currentModel = default_model;
    lastMeshPath = appConfig.defaultModelUrl; // Track default model
    scene.add(default_model);
    setModelSize(default_model, appConfig.defaultModelSize);
    if (retargetInstance) {
        retargetInstance.setModel(default_model);
    }
}

async function onRendererResize() {
    const container = renderer.domElement.parentElement;
    const viewWidth = container.offsetWidth, viewHeight = container.offsetHeight;
    renderer.setSize(viewWidth, viewHeight)
    renderer.setViewport(0, 0, viewWidth, viewHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    camera.aspect = viewWidth / viewHeight
    camera.updateProjectionMatrix();
}
const ro = new ResizeObserver(() => onRendererResize());
ro.observe(renderer.domElement.parentElement);

onRendererResize()
main()
update()

