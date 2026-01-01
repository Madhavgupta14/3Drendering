console.log("Solar Command Center - Hyper-Realism Engine (Three.js) Initialized");

window.addEventListener('load', initSolarSystem);

function initSolarSystem() {
    if (typeof THREE === 'undefined') {
        alert("Error: Three.js library not loaded. Please check your internet connection.");
        return;
    }

    try {
        // --------------------------------------------------------
        // 1. THREE.JS SETUP
        // --------------------------------------------------------
        const container = document.getElementById('canvas-container');
        if (!container) {
            console.error("Canvas Container not found");
            return;
        }
        const scene = new THREE.Scene();

        // Camera
        const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 5000);
        camera.position.set(0, 200, 400); // Initial high angle view
        camera.lookAt(0, 0, 0);

        // Renderer
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "high-performance" }); // Disabled Anti-alias for FPS
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap at 1.5x, don't use full retina
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Keep soft shadows but lower res map defined above
        container.appendChild(renderer.domElement);

        // Resize Handler
        window.addEventListener('resize', () => {
            if (container) {
                const width = container.clientWidth;
                const height = container.clientHeight;
                renderer.setSize(width, height);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        });

        // SPACE DUST / STARS (Particles)
        const starsGeo = new THREE.BufferGeometry();
        const starCount = 2000;
        const starPos = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount * 3; i++) {
            starPos[i] = (Math.random() - 0.5) * 2000;
        }
        starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0.8 });
        const starField = new THREE.Points(starsGeo, starsMat);
        scene.add(starField);

        // --------------------------------------------------------
        // 2. LIGHTING
        // --------------------------------------------------------
        const ambientLight = new THREE.AmbientLight(0x404040, 0.2); // Weak ambient
        scene.add(ambientLight);

        const sunLight = new THREE.PointLight(0xffffff, 1.5, 3000);
        sunLight.position.set(0, 0, 0);
        sunLight.castShadow = true;
        // OPTIMIZATION: Reduced Shadow Map from 2048 to 1024
        sunLight.shadow.mapSize.width = 1024;
        sunLight.shadow.mapSize.height = 1024;
        scene.add(sunLight);

        // --------------------------------------------------------
        // 3. OBJECTS
        // --------------------------------------------------------
        const solarSystemGroup = new THREE.Group();
        scene.add(solarSystemGroup);

        // Texture Loader (Using colors for now to ensure reliability without external assets, 
        // but Material properties will simulate surface types)

        // SUN
        const sunGeo = new THREE.SphereGeometry(30, 64, 64);
        // Replace Basic Material with Shader Material (Applying definition from below - hoisting issue? 
        // No, we need to move sun creation DOWN or define shader UP.
        // I will use a placeholder here and switch the material after shaders are defined.)
        // ACTUALLY, simpler: I'll define a function to update the sun material later, or just init it here with a basic one 
        // content of this block is executed inside initSolarSystem. 
        // The shaders are defined WAY further down. This IS a hoisting issue if I try to use them here.
        // Let's swap the Basic Material for the Shader Material *at the end of init*, or move the object creation down.
        // Moving object creation is risky for references. 
        // I will keep Basic here and upgrade it at the bottom.

        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        sunMesh.userData = { name: "Sun", age: "4.603 Billion Years" }; // Data

        // Add a glow glow mesh?
        const sunGlowGeo = new THREE.SphereGeometry(32, 64, 64);
        const sunGlowMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        const sunGlow = new THREE.Mesh(sunGlowGeo, sunGlowMat);
        sunMesh.add(sunGlow);
        solarSystemGroup.add(sunMesh);

        // Interactable List
        const interactables = [sunMesh];

        // 6. RAYCASTING (HOVER INFO) & 7. VOYAGER MODE (Moved Up)
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const tooltip = document.getElementById('planet-tooltip');
        const tooltipName = document.getElementById('tooltip-name');
        const tooltipAge = document.getElementById('tooltip-age');

        // Focus State
        let focusTarget = null; // The object we are following
        let focusOffset = new THREE.Vector3(0, 5, 15); // Default chase distance

        // TEXTURE/SHADER HELPERS
        // Simple Noise Function (GLSL)
        const noiseGLSL = `
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        float snoise(vec3 v) { 
          const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
          const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i  = floor(v + dot(v, C.yyy) );
          vec3 x0 = v - i + dot(i, C.xxx) ;
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min( g.xyz, l.zxy );
          vec3 i2 = max( g.xyz, l.zxy );
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
          vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y
          i = mod289(i); 
          vec4 p = permute( permute( permute( 
                     i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                   + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                   + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
          float n_ = 0.142857142857; // 1.0/7.0
          vec3  ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4( x.xy, y.xy );
          vec4 b1 = vec4( x.zw, y.zw );
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
          vec3 p0 = vec3(a0.xy,h.x);
          vec3 p1 = vec3(a0.zw,h.y);
          vec3 p2 = vec3(a1.xy,h.z);
          vec3 p3 = vec3(a1.zw,h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;
          return 105.5645 * ( dot(p0, x0) + dot(p1, x1) + 
                              dot(p2, x2) + dot(p3, x3) );
        }
        `;

        const planetVertexShader = `
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vWorldPosition;
        void main() {
            vUv = uv;
            // Calculate World Space Normal and Position for lighting
            vNormalWorld = normalize(mat3(modelMatrix) * normal);
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPos.xyz;
            
            gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
        `;

        const earthFragmentShader = `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vWorldPosition;
        ${noiseGLSL}

        void main() {
            // Animated Clouds
            float noiseVal = snoise(vec3(vUv.x * 6.0 + uTime * 0.1, vUv.y * 6.0, uTime * 0.05));
            float cloud = smoothstep(0.4, 0.7, noiseVal);
            
            // Base Color (Ocean Blue + simple land noise)
            float landNoise = snoise(vec3(vUv.x * 3.0, vUv.y * 3.0, 0.0));
            // Reference Image: Vibrant Blue Water, Green-Brown Land
            vec3 ocean = vec3(0.0, 0.2, 0.8); // Brighter Blue
            vec3 land = vec3(0.1, 0.5, 0.1);  // Green
            vec3 base = mix(ocean, land, smoothstep(0.15, 0.25, landNoise));

            // Mix Base + Clouds
            vec3 planetColor = mix(base, vec3(1.0), cloud);
            
            // LIGHTING CALCULATIONS (Day/Night Cycle)
            vec3 sunPos = vec3(0.0, 0.0, 0.0);
            vec3 lightDir = normalize(sunPos - vWorldPosition);
            
            // Dot Product: 1.0 = Facing Sun, 0.0 = Terminator, -1.0 = Night
            float diff = max(dot(normalize(vNormalWorld), lightDir), 0.0);
            
            // Ambient Light (Night side isn't pitch black, visual choice)
            vec3 ambient = vec3(0.02, 0.02, 0.05); 
            
            // Final Lit Color
            vec3 finalColor = planetColor * (diff + 0.1); // Add weak ambient
            
            // Add City Lights on the Night Side? (Advanced, maybe later)
            // For now, let's keep it simple shadow.

            // Atmosphere rim (Fresnel) - Only visible on lit side mostly? 
            // Or visible everywhere? Realistically, atmosphere glows on limb.
            // Using View Space normal would be better for rim, but let's approximate with cam pos?
            // Actually, simple constant rim is fine for "Game Feel".
            
            gl_FragColor = vec4(finalColor, 1.0);
        }
        `;

        // ------------------------------------------------------------
        // SHADERS (Realistic Planet Procedural Generation)
        // ------------------------------------------------------------

        // 1. Generic Rocky Planet (Mercury, Mars) / Venus (Cloudy)
        const rockyFragmentShader = `
        uniform float uTime;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform float uNoiseScale;
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vWorldPosition;
        ${noiseGLSL}

        void main() {
            // Surface Noise
            float n = snoise(vWorldPosition * uNoiseScale);
            float n2 = snoise(vWorldPosition * (uNoiseScale * 2.0));
            
            // Mix
            float mixVal = smoothstep(-0.5, 0.5, n + n2 * 0.5);
            vec3 planetColor = mix(uColor1, uColor2, mixVal);
            
            // Lighting (Day/Night)
            vec3 sunPos = vec3(0.0, 0.0, 0.0);
            vec3 lightDir = normalize(sunPos - vWorldPosition);
            float diff = max(dot(normalize(vNormalWorld), lightDir), 0.0);
            vec3 ambient = vec3(0.02, 0.02, 0.02);
            
            gl_FragColor = vec4(planetColor * (diff + 0.1), 1.0);
        }
        `;

        // 2. Gas Giant (Jupiter, Saturn, Uranus, Neptune) - Hyper Realistic
        const gasFragmentShader = `
        uniform float uTime;
        uniform vec3 uColor1; // Light Band
        uniform vec3 uColor2; // Dark Band
        uniform vec3 uColor3; // Storm/Detail
        uniform float uBandScale;
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vWorldPosition;
        ${noiseGLSL}

        // Fractional Brownian Motion for detail
        float fbm(vec3 p) {
            float value = 0.0;
            float amplitude = 0.5;
            for (int i = 0; i < 5; i++) {
                value += amplitude * snoise(p);
                p *= 2.0;
                amplitude *= 0.5;
            }
            return value;
        }

        void main() {
            // Domain Warping for Fluid Flow
            vec3 p = vWorldPosition * 0.05; // Scale
            
            // Warp 1
            float q = fbm(p + vec3(0.0, uTime * 0.02, 0.0));
            
            // Warp 2 (Turbulence)
            float r = fbm(p + q + vec3(0.5, 0.4, uTime * 0.01));
            
            // Main pattern flow
            float f = fbm(p + r);
            
            // Latitudinal Bands with Noise Distortion
            float bandPos = vUv.y * uBandScale + (r * 0.5); 
            float bandFactor = sin(bandPos) * 0.5 + 0.5;
            
            // Sharpen bands slightly
            bandFactor = smoothstep(0.2, 0.8, bandFactor);

            // Color Grading
            vec3 base = mix(uColor1, uColor2, bandFactor);
            
            // Add Storm/Swirl Details
            vec3 finalCol = mix(base, uColor3, f * f * 1.5); // Contrast swirls
            
            // Great Red Spot approximation (Jupiter only, via coordinate check? Hard to genericize, 
            // but we can add large low-freq noise blob to simulate major storms)
            float spot = smoothstep(0.6, 1.0, snoise(p * 0.5));
            finalCol = mix(finalCol, uColor3 * 0.8, spot * 0.5);

            // Lighting (Standard + Rim)
            vec3 sunPos = vec3(0.0, 0.0, 0.0);
            vec3 lightDir = normalize(sunPos - vWorldPosition);
            float intensity = max(dot(normalize(vNormalWorld), lightDir), 0.0);
            
            // Stronger Limb Darkening for Gas Giants
            float viewAngle = dot(normalize(vNormalWorld), vec3(0,0,1));
            float limb = pow(1.0 - viewAngle, 2.5);
            
            // Shadow side ambient
            vec3 ambient = vec3(0.01, 0.01, 0.02);
            
            gl_FragColor = vec4(finalCol * (intensity + 0.1) + (uColor1 * limb * 0.1), 1.0);
        }
        `;

        // 3. SUN SHADER (Fiery Plasma)
        const sunFragmentShader = `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vWorldPosition;
        ${noiseGLSL}

        void main() {
            // Animated Surface Noise
            float n = snoise(vWorldPosition * 0.2 + vec3(0.0, 0.0, uTime * 0.2));
            float n2 = snoise(vWorldPosition * 0.4 - vec3(uTime * 0.1, 0.0, 0.0));
            
            // Mix noise layers
            float noiseVal = n * 0.6 + n2 * 0.4;
            
            // Color Ramp: Bright Yellow Core -> Orange -> Reddish Perimeter
            vec3 core = vec3(1.0, 1.0, 0.6); // White-Yellow
            vec3 mid = vec3(1.0, 0.6, 0.1);  // Gold-Orange
            vec3 edge = vec3(0.8, 0.1, 0.0); // Red-Orange
            
            // Radial gradient based on view angle (Fresnel-like) to simulate heat depth
            float viewAngle = dot(normalize(vNormalWorld), vec3(0,0,1));
            float heat = smoothstep(0.0, 1.0, viewAngle + noiseVal * 0.2);
            
            vec3 col = mix(edge, mid, heat);
            col = mix(col, core, smoothstep(0.8, 1.2, heat)); // Core hot spot

            // Add Solar Flares (bright spots)
            float flare = smoothstep(0.7, 1.0, n2);
            col += vec3(0.5, 0.4, 0.2) * flare;

            gl_FragColor = vec4(col, 1.0);
        }
        `;

        // PLANET CONFIGURATIONS (Reference Image Matching)
        const planetConfigs = {
            // Mercury: Brownish/Tan, Textured
            "Mercury": { type: 'rocky', c1: 0x9e8770, c2: 0x5c4d42, scale: 0.8 },

            // Venus: Golden Orange/Brown, Swirling
            "Venus": { type: 'rocky', c1: 0xd9863d, c2: 0xa65e2e, scale: 0.4 },

            // Mars: Dusty Rust/Red
            "Mars": { type: 'rocky', c1: 0xc1440e, c2: 0x8b3a1a, scale: 0.6 },

            // Jupiter: Cream & Dark Brown stripes (High Contrast)
            "Jupiter": { type: 'gas', c1: 0xe3dccb, c2: 0x8c4718, c3: 0xcd853f, bands: 10.0 },

            // Saturn: Golden Yellow & Tan
            "Saturn": { type: 'gas', c1: 0xf4d03f, c2: 0xcdb87d, c3: 0xbf9b30, bands: 8.0, rings: true },

            // Uranus: Solid Light Cyan/Blue (Clean)
            "Uranus": { type: 'gas', c1: 0x73fcd6, c2: 0x5ec4d6, c3: 0xa2c8c9, bands: 1.5 },

            // Neptune: Deep Royal Blue
            "Neptune": { type: 'gas', c1: 0x1d37b8, c2: 0x172280, c3: 0x4b70dd, bands: 3.0 }
        };

        // PLANET FACTORY
        function createPlanet(name, size, fallbackColor, distance, speed, age) {
            // OPTIMIZATION: Reduced segments from 64 to 32
            const geo = new THREE.SphereGeometry(size, 32, 32);
            let mat;
            let mesh;

            // 0. SUN (Special Case if we were using this factory for it, but Sun is separate. 
            // Wait, implementation plan says update Sun too.
            // But Sun is created manually above line 80.
            // I should update the Sun Material *after* this config update.)

            // 1. EARTH (Special Case: Vibrant Blue/Green)
            if (name === "Earth") {
                mat = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 },
                        // Ocean: 0x0000ff -> Deep Blue, Land: 0x00ff00 -> Vibrant Green
                        // We need to pass these to the earth shader or hardcode them there.
                        // Currently Earth shader has hardcoded colors. I should probably allow injection 
                        // or just tweak the shader itself.
                        // Let's rely on the Earth Fragment Shader edit coming up or assume it's "good enough" 
                        // but the user said "from pic". Pic Earth is very blue/green.
                        uBaseColor: { value: new THREE.Color(fallbackColor) }
                    },
                    vertexShader: planetVertexShader,
                    fragmentShader: earthFragmentShader
                });
            }
            // 2. PROCEDURAL PLANETS
            else if (planetConfigs[name]) {
                const cfg = planetConfigs[name];

                if (cfg.type === 'rocky') {
                    mat = new THREE.ShaderMaterial({
                        uniforms: {
                            uTime: { value: 0 },
                            uColor1: { value: new THREE.Color(cfg.c1) },
                            uColor2: { value: new THREE.Color(cfg.c2 === 0x8a2be2 ? 0x652207 : cfg.c2) }, // Fix Mars
                            uNoiseScale: { value: cfg.scale }
                        },
                        vertexShader: planetVertexShader,
                        fragmentShader: rockyFragmentShader
                    });
                } else if (cfg.type === 'gas') {
                    mat = new THREE.ShaderMaterial({
                        uniforms: {
                            uTime: { value: 0 },
                            uColor1: { value: new THREE.Color(cfg.c1) },
                            uColor2: { value: new THREE.Color(cfg.c2) },
                            uColor3: { value: new THREE.Color(cfg.c3) },
                            uBandScale: { value: cfg.bands }
                        },
                        vertexShader: planetVertexShader,
                        fragmentShader: gasFragmentShader
                    });
                }
            }
            // 3. FALLBACK
            else {
                mat = new THREE.MeshStandardMaterial({ color: fallbackColor });
            }

            mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = { name: name, age: age };

            // Group
            const orbitGroup = new THREE.Group();
            mesh.position.x = distance;
            orbitGroup.add(mesh);

            // RINGS (Saturn)
            if (planetConfigs[name] && planetConfigs[name].rings) {
                const ringGeo = new THREE.RingGeometry(size * 1.4, size * 2.2, 64);
                // Simple ring shader or texture? Basic transparent for now.
                const ringMat = new THREE.MeshBasicMaterial({
                    color: 0xcbb7b0,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.8
                });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = Math.PI / 2.2; // Tilt
                mesh.add(ring);
            }

            // Orbit Track
            const trackGeo = new THREE.RingGeometry(distance - 0.5, distance + 0.5, 128);
            const trackMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide });
            const track = new THREE.Mesh(trackGeo, trackMat);
            track.rotation.x = Math.PI / 2;

            return { mesh, orbitGroup, track, speed, angle: Math.random() * Math.PI * 2, distance };
        }

        // Definition of planets array... (unchanged)
        const planets = [
            // Mercury, Venus... (will call new function)
            createPlanet("Mercury", 4, 0xaaaaaa, 50, 0.02, "4.503 Billion Years"),
            createPlanet("Venus", 7, 0xeecaa0, 70, 0.015, "4.503 Billion Years"),
            createPlanet("Earth", 8, 0x22aaff, 100, 0.01, "4.543 Billion Years"),
            createPlanet("Mars", 6, 0xdd4422, 130, 0.008, "4.603 Billion Years"),
            createPlanet("Jupiter", 18, 0xdcb178, 180, 0.004, "4.603 Billion Years"),
            createPlanet("Saturn", 15, 0xf4d03f, 230, 0.003, "4.503 Billion Years"),
            createPlanet("Uranus", 10, 0x73fcd6, 270, 0.002, "4.503 Billion Years"),
            createPlanet("Neptune", 10, 0x4b70dd, 310, 0.001, "4.503 Billion Years")
        ];

        // Add to scene & interactables
        planets.forEach(p => {
            solarSystemGroup.add(p.orbitGroup);
            solarSystemGroup.add(p.track);
            interactables.push(p.mesh);
        });

        // EARTH MOON
        const earthData = planets[2];
        const moonGeo = new THREE.SphereGeometry(2, 16, 16);
        const moonMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
        const moon = new THREE.Mesh(moonGeo, moonMat);
        moon.position.x = 15;
        moon.userData = { name: "Moon", age: "4.53 Billion Years" };
        earthData.mesh.add(moon);
        interactables.push(moon); // Check moon separately? It's inside Earth mesh group. 
        // Note: Raycasting works on world coords. Earth group moves, so does moon. 
        // We need to raycast recursively or update moon world matrix? Raycaster handles it if we check scene. 
        // But for efficiency checking list is better. 
        // Since Moon is child of Earth Mesh ( wait, in createPlanet mesh is child of orbitGroup. EarthData.mesh is the planet sphere. )
        // So Moon is child of Earth Sphere. Safe.



        // ASTEROID BELT MANAGEMENT
        let asteroidMesh = null;
        let asteroidDensity = 1500;
        const asteroidGeo = new THREE.DodecahedronGeometry(1, 0);
        const asteroidMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });

        function generateAsteroidBelt(count) {
            // Cleanup old
            if (asteroidMesh) {
                solarSystemGroup.remove(asteroidMesh);
                // Geometry/Material reused, no need to dispose them, just the mesh usage
                asteroidMesh = null;
            }

            if (count <= 0) return;

            asteroidMesh = new THREE.InstancedMesh(asteroidGeo, asteroidMat, count);
            const dummy = new THREE.Object3D();

            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;

                let radius, y;

                // 10% scattered asteroids (Kuiper Belt styles or rogue)
                if (Math.random() < 0.1) {
                    radius = 180 + Math.random() * 200; // Far out
                    y = (Math.random() - 0.5) * 60; // High inclination
                } else {
                    // Standard Belt
                    radius = 145 + Math.random() * 30;
                    y = (Math.random() - 0.5) * 12;
                }

                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;

                dummy.position.set(x, y, z);
                const s = 1 + Math.random() * 2;
                dummy.scale.set(s, s, s);
                dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                dummy.updateMatrix();
                asteroidMesh.setMatrixAt(i, dummy.matrix);
            }
            solarSystemGroup.add(asteroidMesh);
        }

        // Initial Generation
        generateAsteroidBelt(asteroidDensity);

        // TOGGLES
        const toggleOrbit = document.getElementById('toggle-inner');
        if (toggleOrbit) {
            toggleOrbit.onchange = (e) => {
                planets.forEach(p => p.track.visible = e.target.checked);
            };
        }

        const toggleGrid = document.getElementById('toggle-grid');
        const gridDiv = document.querySelector('.grid-floor');
        if (toggleGrid && gridDiv) {
            toggleGrid.onchange = (e) => {
                gridDiv.style.opacity = e.target.checked ? '1' : '0';
            };
        }

        // --------------------------------------------------------
        // 4. ANIMATION LOOP
        // --------------------------------------------------------

        // 5. COSMIC EVENTS: SHOOTING STARS
        const starGeom = new THREE.ConeGeometry(0.5, 30, 8); // Long tail
        const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
        const comets = [];

        function spawnComet() {
            const comet = new THREE.Mesh(starGeom, starMat);

            // Random Start Position (Far away)
            const x = (Math.random() - 0.5) * 800;
            const y = (Math.random() - 0.5) * 400;
            const z = (Math.random() - 0.5) * 800;
            comet.position.set(x, y, z);

            // Aim at random point
            const targetX = (Math.random() - 0.5) * 800;
            const targetY = (Math.random() - 0.5) * 400;
            const targetZ = (Math.random() - 0.5) * 800;

            comet.lookAt(targetX, targetY, targetZ);
            comet.rotateX(Math.PI / 2); // Align cone point

            // Custom Velocity property
            const dir = new THREE.Vector3(targetX - x, targetY - y, targetZ - z).normalize();
            comet.userData = { velocity: dir.multiplyScalar(4 + Math.random() * 5), life: 100 };

            scene.add(comet);
            comets.push(comet);
        }

        let warpSpeed = 1;
        let targetGroupRotX = 0;
        let targetGroupRotY = 0;

        function animate() {
            requestAnimationFrame(animate);

            // Planet Orbits
            planets.forEach(p => {
                p.orbitGroup.rotation.y += p.speed * warpSpeed;
                p.mesh.rotation.y += 0.01;
            });

            // Asteroid Belt Rotation
            if (asteroidMesh) asteroidMesh.rotation.y += 0.002 * warpSpeed;

            // Smooth Camera/Group Controls (ONLY IF NOT FOCUSED)
            if (!focusTarget) {
                solarSystemGroup.rotation.x += (targetGroupRotX - solarSystemGroup.rotation.x) * 0.03;
                solarSystemGroup.rotation.z += (targetGroupRotY - solarSystemGroup.rotation.z) * 0.03;
            } else {
                // FOCUS MODE LOGIC:
                // 1. Get World Position of Planet
                const targetWorldPos = new THREE.Vector3();
                focusTarget.getWorldPosition(targetWorldPos);

                // 2. Desired Camera Position (PlanetPos + Offset)
                // Note: Offset should probably be relative to planet rotation if we want to "orbit" it, 
                // but just a fixed offset in World Space is stable "Chase Cam".
                const desiredPos = targetWorldPos.clone().add(focusOffset);

                // 3. Smooth Lerp
                camera.position.lerp(desiredPos, 0.05);
                camera.lookAt(targetWorldPos);
            }

            // Sun Pulse
            const scale = 1 + Math.sin(Date.now() * 0.002) * 0.05;
            sunMesh.scale.set(scale, scale, scale);

            // Update Time Uniforms for PROCDERUL SHADERS
            planets.forEach(p => {
                if (p.mesh.material.uniforms) {
                    p.mesh.material.uniforms.uTime.value = Date.now() * 0.001;
                }
            });

            // Update Sun Shader Time
            if (sunMesh.material.uniforms) {
                sunMesh.material.uniforms.uTime.value = Date.now() * 0.001;
            }

            // ------------------------------------------------
            // LATE BINDING: UPGRADE SUN MATERIAL
            // ------------------------------------------------
            // Now that shaders are defined, let's swap the Sun's material
            const fierySunMat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 }
                },
                vertexShader: planetVertexShader, // Reuse the standard one (pass normal/worldPos)
                fragmentShader: sunFragmentShader  // The new fiery one
            });
            sunMesh.material = fierySunMat;


            // SHOOTING STARS ANIMATION
            if (Math.random() < 0.02) spawnComet(); // 2% chance per frame

            renderer.render(scene, camera);
        }
        animate();


        // UI HANDLERS
        // 1. ASTEROID DENSITY
        const ringCountDisplay = document.getElementById('ring-count');
        const addRingBtn = document.getElementById('add-ring');
        const removeRingBtn = document.getElementById('remove-ring');

        function updateAsteroids() {
            generateAsteroidBelt(asteroidDensity);
        }

        if (addRingBtn && removeRingBtn && ringCountDisplay) {
            ringCountDisplay.textContent = asteroidDensity;
            addRingBtn.onclick = () => {
                asteroidDensity += 200;
                ringCountDisplay.textContent = asteroidDensity;
                updateAsteroids();
            };
            removeRingBtn.onclick = () => {
                asteroidDensity = Math.max(0, asteroidDensity - 200);
                ringCountDisplay.textContent = asteroidDensity;
                updateAsteroids();
            };
        }

        // 2. VIEW COMMANDS & ACTIONS
        const sunElement = document.getElementById('filter-sun'); // Wait, button is action-btn

        // Helper to handle all button clicks
        document.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.getAttribute('data-btn');
                const id = btn.id;

                // Helper to handle highlight for group
                function setActiveInGroup(groupSelector, activeBtn) {
                    document.querySelectorAll(groupSelector).forEach(b => b.classList.remove('active'));
                    activeBtn.classList.add('active');
                }

                // Mode Buttons
                if (action === 'speed-fast') {
                    warpSpeed = 10;
                    setActiveInGroup('.mode-buttons button', btn);
                }
                if (action === 'speed-normal') {
                    warpSpeed = 1;
                    setActiveInGroup('.mode-buttons button', btn);
                }

                // View Buttons
                if (action === 'view-top') {
                    // Logic: Disable Gyro to prevent hand from fighting the view
                    gyroEnabled = false;
                    if (toggleGyro) toggleGyro.checked = false;
                    focusTarget = null; // Stop Chasing

                    targetGroupRotX = 0;
                    targetGroupRotY = 0;
                    solarSystemGroup.rotation.set(0, 0, 0); // Force Reset

                    camera.position.set(0, 450, 0);
                    camera.lookAt(0, 0, 0);

                    // Highlight
                    setActiveInGroup('.mini-buttons button', btn);
                }
                if (action === 'view-side') {
                    gyroEnabled = false;
                    if (toggleGyro) toggleGyro.checked = false;
                    focusTarget = null; // Stop Chasing

                    targetGroupRotX = 0; targetGroupRotY = 0;
                    solarSystemGroup.rotation.set(0, 0, 0);

                    camera.position.set(0, 0, 450);
                    camera.lookAt(0, 0, 0);
                    setActiveInGroup('.mini-buttons button', btn);
                }
                if (action === 'view-free') {
                    // Re-enable Gyro for free look? Or let user decide?
                    // Usually Free Look implies manual control. Let's enable it.
                    gyroEnabled = true;
                    if (toggleGyro) toggleGyro.checked = true;
                    focusTarget = null; // Stop Chasing

                    camera.position.set(0, 200, 400);
                    camera.lookAt(0, 0, 0);
                    setActiveInGroup('.mini-buttons button', btn);
                }

                // Actions
                if (action === 'filter-sun') {
                    btn.classList.toggle('active');
                    if (sunGlow) sunGlow.visible = !sunGlow.visible;
                }
                if (action === 'reset-view') {
                    camera.position.set(0, 200, 400);
                    camera.lookAt(0, 0, 0);
                    solarSystemGroup.rotation.set(0, 0, 0);
                    targetGroupRotX = 0;
                    targetGroupRotY = 0;
                    warpSpeed = 1;

                    // Reset All Highlights
                    document.querySelectorAll('button').forEach(b => b.classList.remove('active'));

                    // Set Defaults
                    const rt = document.querySelector('[data-btn="speed-normal"]');
                    if (rt) rt.classList.add('active');

                    const free = document.querySelector('[data-btn="view-free"]');
                    if (free) free.classList.add('active');
                }
            });
        });


        // MEDIA PIPE
        const videoElement = document.getElementById('feed-sidebar');

        // GYRO TOGGLE STATE
        let gyroEnabled = true;
        const toggleGyro = document.getElementById('toggle-gyro');
        if (toggleGyro) {
            toggleGyro.onchange = (e) => {
                gyroEnabled = e.target.checked;
            };
        }

        function onResults(results) {
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const landmarks = results.multiHandLandmarks[0];

                // Hand Tilt -> Scene Rotation (Gyro Mode)
                if (gyroEnabled) {
                    const wrist = landmarks[0];
                    const middleMCP = landmarks[9];

                    // Pitch (Up/Down)
                    const pitch = (wrist.y - middleMCP.y);
                    targetGroupRotX = (pitch - 0.2) * 1.5; // Reduced from 2.0 to 1.5

                    // Roll (Left/Right)
                    const roll = (wrist.x - middleMCP.x);
                    targetGroupRotY = roll * 1.5; // Reduced from 2.0 to 1.5
                }

                // Pan/Zoom?
                // Let's map Index finger 8 to Camera Position offset?
                // Or just let tilt be the main fun factor for 3D.

                function lerp(start, end, amt) {
                    return (1 - amt) * start + amt * end
                }

                // Zoom (Pinch) - Incremental Mode
                const thumbTip = landmarks[4];
                const indexTip = landmarks[8];
                const distance = Math.sqrt(
                    Math.pow(thumbTip.x - indexTip.x, 2) +
                    Math.pow(thumbTip.y - indexTip.y, 2)
                );

                // Neutral Zone: 0.05 to 0.1
                // < 0.05 : Pinch (Zoom OUT / Move Away)
                // > 0.12 : Spread (Zoom IN / Move Closer)

                const zoomSpeed = 5.0; // Speed of zoom

                if (distance < 0.05) {
                    // Pinching -> Zoom Out (Increase Z)
                    camera.position.z += zoomSpeed;
                } else if (distance > 0.12) {
                    // Spreading -> Zoom In (Decrease Z)
                    camera.position.z -= zoomSpeed;
                }

                // Clamp Zoom Limits
                camera.position.z = Math.max(100, Math.min(1000, camera.position.z));
            }
        }

        const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        hands.onResults(onResults);

        const cameraMP = new Camera(videoElement, {
            onFrame: async () => { await hands.send({ image: videoElement }); },
            width: 640, height: 480
        });
        cameraMP.start();
        // Definitions moved to top to prevent ReferenceError
        function onMouseMove(event) {
            // Calculate mouse position in normalized device coordinates (-1 to +1) 
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            // Raycast
            raycaster.setFromCamera(mouse, camera);

            // Check against interactables
            const intersects = raycaster.intersectObjects(interactables, true);

            if (intersects.length > 0) {
                const hit = intersects[0].object;
                document.body.style.cursor = 'pointer';

                if (hit.userData && hit.userData.name) {
                    // Update Tooltip
                    tooltipName.textContent = hit.userData.name;
                    tooltipAge.textContent = hit.userData.age;

                    // Position Tooltip
                    tooltip.style.display = 'block';
                    tooltip.style.left = (event.clientX + 15) + 'px';
                    tooltip.style.top = (event.clientY + 15) + 'px';
                }
            } else {
                tooltip.style.display = 'none';
                document.body.style.cursor = 'default';
            }
        }

        function onMouseClick(event) {
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(interactables, true);
            if (intersects.length > 0) {
                const hit = intersects[0].object;
                // Set Focus
                focusTarget = hit;
                console.log("Focusing on:", hit.userData.name);

                // If Sun, look from further away
                if (hit.userData.name === 'Sun') {
                    focusOffset.set(0, 50, 100);
                } else {
                    // Adjust offset based on planet size approx
                    // hit.geometry.parameters.radius usually available if primitive
                    const r = hit.geometry.parameters.radius || 5;
                    focusOffset.set(0, r * 1.5, r * 4);
                }

                // Disable Gyro to prevent fighting
                gyroEnabled = false;
                if (toggleGyro) toggleGyro.checked = false;
            } else {
                // Click empty space -> Clear Focus
                focusTarget = null;
            }
        }

        window.addEventListener('mousemove', onMouseMove, false);
        window.addEventListener('click', onMouseClick, false);

    } catch (e) {
        console.error("Initialization Error:", e);
        alert("System Error: " + e.message);
    }
}
