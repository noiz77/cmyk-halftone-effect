// ===== CMYK Halftone WebGL Shader =====

// Vertex Shader
const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
`;

// Fragment Shader - Full CMYK Halftone with all features
const fragmentShaderSource = `
    precision highp float;
    
    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform vec2 u_resolution;
    
    // Parameters
    uniform float u_dotSize;
    uniform float u_gridNoise;
    uniform int u_type; // 0: dots, 1: ink, 2: sharp
    uniform float u_softness;
    uniform float u_contrast;
    uniform float u_scale;
    
    // Gain per channel
    uniform float u_gainC;
    uniform float u_gainM;
    uniform float u_gainY;
    uniform float u_gainK;
    
    // Flood per channel
    uniform float u_floodC;
    uniform float u_floodM;
    uniform float u_floodY;
    uniform float u_floodK;
    
    // Grain
    uniform float u_grainMixing;
    uniform float u_grainOverlay;
    uniform float u_grainSize;
    
    // Colors
    uniform vec3 u_colorC;
    uniform vec3 u_colorM;
    uniform vec3 u_colorY;
    uniform vec3 u_colorK;
    uniform vec3 u_colorBg;
    
    // Constants
    const float PI = 3.14159265359;
    
    // Pseudo-random function
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }
    
    // Hash function for grid noise
    vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
    }
    
    // RGB to CMYK conversion
    vec4 rgbToCmyk(vec3 rgb) {
        float k = 1.0 - max(max(rgb.r, rgb.g), rgb.b);
        if (k >= 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
        float c = (1.0 - rgb.r - k) / (1.0 - k);
        float m = (1.0 - rgb.g - k) / (1.0 - k);
        float y = (1.0 - rgb.b - k) / (1.0 - k);
        return vec4(c, m, y, k);
    }
    
    // Rotate point around origin
    vec2 rotate(vec2 p, float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    }
    
    // Get dot value for a single channel
    float getDot(vec2 uv, vec2 center, float radius, float softness) {
        float dist = length(uv - center);
        if (softness <= 0.0) {
            return step(dist, radius);
        }
        float edge = softness * radius * 0.5;
        return 1.0 - smoothstep(radius - edge, radius + edge, dist);
    }
    
    // Get overlapping dots value (checks neighbors)
    float getOverlappingDots(vec2 pixelPos, vec2 gridSize, float channelAngle, int channelIndex, float softness, float noise, float gain, float flood) {
        vec2 rotatedPos = rotate(pixelPos, channelAngle);
        vec2 cell = floor(rotatedPos / gridSize);
        
        float totalDot = 0.0;
        
        // Check 3x3 grid of cells for overlapping
        for (int dx = -1; dx <= 1; dx++) {
            for (int dy = -1; dy <= 1; dy++) {
                vec2 neighborCell = cell + vec2(float(dx), float(dy));
                vec2 neighborCenter = (neighborCell + 0.5) * gridSize;
                
                // Add noise offset
                vec2 noiseOffset = hash2(neighborCell) * noise * gridSize.x * 0.5;
                neighborCenter += noiseOffset;
                
                // Sample color at neighbor center
                vec2 samplePos = rotate(neighborCenter, -channelAngle) / u_resolution;
                samplePos = clamp(samplePos, 0.0, 1.0);
                
                vec3 sampleRgb = texture2D(u_image, samplePos).rgb;
                
                // Apply contrast
                sampleRgb = (sampleRgb - 0.5) * u_contrast + 0.5;
                sampleRgb = clamp(sampleRgb, 0.0, 1.0);
                
                vec4 cmyk = rgbToCmyk(sampleRgb);
                float value;
                if (channelIndex == 0) value = cmyk.x;
                else if (channelIndex == 1) value = cmyk.y;
                else if (channelIndex == 2) value = cmyk.z;
                else value = cmyk.w;
                
                // Apply gain and flood
                value = value * (1.0 + gain) + flood;
                value = clamp(value, 0.0, 1.0);
                
                // Calculate radius (allow overlap by using larger multiplier)
                float maxRadius = gridSize.x * 0.7;
                float radius = value * maxRadius;
                
                float dot = getDot(rotatedPos, neighborCenter, radius, softness);
                totalDot = max(totalDot, dot);
            }
        }
        
        return totalDot;
    }
    
    // Gooey/Ink effect using metaball-like blending
    float getInkDots(vec2 pixelPos, vec2 gridSize, float channelAngle, int channelIndex, float softness, float noise, float gain, float flood) {
        vec2 rotatedPos = rotate(pixelPos, channelAngle);
        vec2 cell = floor(rotatedPos / gridSize);
        
        float metaball = 0.0;
        
        // Check 3x3 grid
        for (int dx = -1; dx <= 1; dx++) {
            for (int dy = -1; dy <= 1; dy++) {
                vec2 neighborCell = cell + vec2(float(dx), float(dy));
                vec2 neighborCenter = (neighborCell + 0.5) * gridSize;
                
                vec2 noiseOffset = hash2(neighborCell) * noise * gridSize.x * 0.5;
                neighborCenter += noiseOffset;
                
                vec2 samplePos = rotate(neighborCenter, -channelAngle) / u_resolution;
                samplePos = clamp(samplePos, 0.0, 1.0);
                
                vec3 sampleRgb = texture2D(u_image, samplePos).rgb;
                sampleRgb = (sampleRgb - 0.5) * u_contrast + 0.5;
                sampleRgb = clamp(sampleRgb, 0.0, 1.0);
                
                vec4 cmyk = rgbToCmyk(sampleRgb);
                float value;
                if (channelIndex == 0) value = cmyk.x;
                else if (channelIndex == 1) value = cmyk.y;
                else if (channelIndex == 2) value = cmyk.z;
                else value = cmyk.w;
                
                value = value * (1.0 + gain) + flood;
                value = clamp(value, 0.0, 1.0);
                
                float maxRadius = gridSize.x * 0.7;
                float radius = value * maxRadius;
                
                float dist = length(rotatedPos - neighborCenter);
                if (radius > 0.0 && dist < radius * 2.0) {
                    // Metaball contribution
                    float contribution = (radius * radius) / (dist * dist + 0.001);
                    metaball += contribution;
                }
            }
        }
        
        // Threshold for gooey effect
        float threshold = 1.0;
        float edge = softness * 0.5 + 0.1;
        return smoothstep(threshold - edge, threshold + edge, metaball);
    }
    
    void main() {
        vec2 pixelPos = v_texCoord * u_resolution;
        float scaledDotSize = u_dotSize * (u_scale / 100.0);
        vec2 gridSize = vec2(scaledDotSize);
        
        // Channel angles (15 degrees apart, like real CMYK printing)
        float baseAngle = 15.0 * PI / 180.0;
        float angleC = baseAngle;
        float angleM = baseAngle + PI / 6.0;
        float angleY = baseAngle + PI / 12.0;
        float angleK = baseAngle + PI / 4.0;
        
        float dotC, dotM, dotY, dotK;
        float noise = u_gridNoise;
        float softness = u_softness;
        
        if (u_type == 0) {
            // Dots mode: standard overlapping dots
            dotC = getOverlappingDots(pixelPos, gridSize, angleC, 0, softness, noise, u_gainC, u_floodC);
            dotM = getOverlappingDots(pixelPos, gridSize, angleM, 1, softness, noise, u_gainM, u_floodM);
            dotY = getOverlappingDots(pixelPos, gridSize, angleY, 2, softness, noise, u_gainY, u_floodY);
            dotK = getOverlappingDots(pixelPos, gridSize, angleK, 3, softness, noise, u_gainK, u_floodK);
            
        } else if (u_type == 1) {
            // Ink mode: gooey metaball effect
            dotC = getInkDots(pixelPos, gridSize, angleC, 0, softness, noise, u_gainC, u_floodC);
            dotM = getInkDots(pixelPos, gridSize, angleM, 1, softness, noise, u_gainM, u_floodM);
            dotY = getInkDots(pixelPos, gridSize, angleY, 2, softness, noise, u_gainY, u_floodY);
            dotK = getInkDots(pixelPos, gridSize, angleK, 3, softness, noise, u_gainK, u_floodK);
            
        } else {
            // Sharp mode: direct pixel sampling with hard edges
            vec3 rgb = texture2D(u_image, v_texCoord).rgb;
            rgb = (rgb - 0.5) * u_contrast + 0.5;
            rgb = clamp(rgb, 0.0, 1.0);
            
            vec4 cmyk = rgbToCmyk(rgb);
            
            float cVal = cmyk.x * (1.0 + u_gainC) + u_floodC;
            float mVal = cmyk.y * (1.0 + u_gainM) + u_floodM;
            float yVal = cmyk.z * (1.0 + u_gainY) + u_floodY;
            float kVal = cmyk.w * (1.0 + u_gainK) + u_floodK;
            
            cVal = clamp(cVal, 0.0, 1.0);
            mVal = clamp(mVal, 0.0, 1.0);
            yVal = clamp(yVal, 0.0, 1.0);
            kVal = clamp(kVal, 0.0, 1.0);
            
            // Simple dot rendering with noise
            vec2 cellC = mod(rotate(pixelPos, angleC) + hash2(floor(rotate(pixelPos, angleC) / gridSize)) * noise * gridSize.x * 0.5, gridSize);
            vec2 cellM = mod(rotate(pixelPos, angleM) + hash2(floor(rotate(pixelPos, angleM) / gridSize)) * noise * gridSize.x * 0.5, gridSize);
            vec2 cellY = mod(rotate(pixelPos, angleY) + hash2(floor(rotate(pixelPos, angleY) / gridSize)) * noise * gridSize.x * 0.5, gridSize);
            vec2 cellK = mod(rotate(pixelPos, angleK) + hash2(floor(rotate(pixelPos, angleK) / gridSize)) * noise * gridSize.x * 0.5, gridSize);
            
            vec2 center = gridSize * 0.5;
            float maxRadius = gridSize.x * 0.5;
            
            dotC = getDot(cellC, center, cVal * maxRadius, softness);
            dotM = getDot(cellM, center, mVal * maxRadius, softness);
            dotY = getDot(cellY, center, yVal * maxRadius, softness);
            dotK = getDot(cellK, center, kVal * maxRadius, softness);
        }
        
        // Subtractive color mixing (multiply blend)
        vec3 color = u_colorBg;
        color = mix(color, color * u_colorC, dotC);
        color = mix(color, color * u_colorM, dotM);
        color = mix(color, color * u_colorY, dotY);
        color = mix(color, color * u_colorK, dotK);
        
        // Apply grain
        if (u_grainOverlay > 0.0 || u_grainMixing > 0.0) {
            float grainScale = max(1.0, u_grainSize * 5.0);
            vec2 grainCoord = v_texCoord * u_resolution / grainScale;
            float grain = random(grainCoord);
            
            // Overlay grain
            if (u_grainOverlay > 0.0) {
                float overlayGrain = grain > 0.5 ? 
                    1.0 - 2.0 * (1.0 - grain) * (1.0 - 0.5) : 
                    2.0 * grain * 0.5;
                color = mix(color, color * (0.5 + overlayGrain), u_grainOverlay);
            }
            
            // Mixing grain
            if (u_grainMixing > 0.0) {
                color = mix(color, vec3(grain), u_grainMixing * 0.3);
            }
        }
        
        gl_FragColor = vec4(color, 1.0);
    }
`;

// ===== i18n Translations =====
const translations = {
    zh: {
        tagline: '复古印刷半色调效果生成器',
        dropOrClick: '拖拽或点击上传图片',
        reset: '重置',
        download: '下载',
        presets: '预设',
        parameters: '参数',
        presetDefault: '默认',
        presetDrops: '油墨',
        presetNewspaper: '报纸',
        presetVintage: '复古',
        type: '类型',
        typeDots: '圆点',
        typeInk: '墨迹',
        typeSharp: '锐利',
        size: '大小',
        gridNoise: '网格噪点',
        softness: '柔和度',
        contrast: '对比度',
        scale: '缩放',
        colors: '颜色',
        gain: '增益',
        flood: '溢出',
        grain: '颗粒',
        mixing: '混合',
        overlay: '叠加',
        grainSize: '大小',
        fill: '背景',
        footer: '基于 <a href="https://paper.design/blog/retro-print-cmyk-halftone-shader" target="_blank">Paper.design</a> 技术原理',
        langSwitch: 'English'
    },
    en: {
        tagline: 'Retro Print Effect Generator',
        dropOrClick: 'Drop or click to upload image',
        reset: 'Reset',
        download: 'Download',
        presets: 'Presets',
        parameters: 'Parameters',
        presetDefault: 'Default',
        presetDrops: 'Drops',
        presetNewspaper: 'Newspaper',
        presetVintage: 'Vintage',
        type: 'Type',
        typeDots: 'Dots',
        typeInk: 'Ink',
        typeSharp: 'Sharp',
        size: 'Size',
        gridNoise: 'Grid Noise',
        softness: 'Softness',
        contrast: 'Contrast',
        scale: 'Scale',
        colors: 'Colors',
        gain: 'Gain',
        flood: 'Flood',
        grain: 'Grain',
        mixing: 'Mixing',
        overlay: 'Overlay',
        grainSize: 'Size',
        fill: 'Fill',
        footer: 'Based on <a href="https://paper.design/blog/retro-print-cmyk-halftone-shader" target="_blank">Paper.design</a> technical principles',
        langSwitch: '简体中文'
    }
};

// ===== WebGL Setup =====
class CMYKHalftone {
    constructor() {
        this.canvas = document.getElementById('glCanvas');
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');

        if (!this.gl) {
            alert('WebGL is not available. Please use a modern browser.');
            return;
        }

        this.program = null;
        this.texture = null;
        this.imageLoaded = false;
        this.originalImage = null;
        this.currentLang = 'zh'; // Default to Chinese

        // Default parameters (based on Drops preset)
        this.params = {
            dotSize: 88,
            gridNoise: 0.50,
            type: 1, // 0: dots, 1: ink, 2: sharp
            softness: 0,
            contrast: 1.15,
            scale: 1.0,
            gainC: 1.0,
            gainM: 0.44,
            gainY: -1.0,
            gainK: 0,
            floodC: 0.15,
            floodM: 0,
            floodY: 0,
            floodK: 0,
            grainMixing: 0.05,
            grainOverlay: 0.25,
            grainSize: 0.01,
            colorC: [0, 0.698, 1],      // #00B2FF
            colorM: [0.988, 0.31, 0.31], // #FC4F4F
            colorY: [1, 0.85, 0],        // #FFD900
            colorK: [0.137, 0.122, 0.125], // #231F20
            colorBg: [0.933, 0.937, 0.843]  // #EEEFD7
        };

        // Official presets based on the provided screenshots
        this.presets = {
            default: {
                type: 0, // Dots
                size: 10,
                gridNoise: 0,
                softness: 0,
                contrast: 100,
                scale: 100,
                colorC: '#00FFFF',
                colorM: '#FF00FF',
                colorY: '#FFFF00',
                colorK: '#000000',
                colorBg: '#FFFFFF',
                gainC: 0,
                gainM: 0,
                gainY: 0,
                gainK: 0,
                floodC: 0,
                floodM: 0,
                floodY: 0,
                floodK: 0,
                grainMixing: 0,
                grainOverlay: 0,
                grainSize: 0
            },
            drops: {
                type: 1, // Ink
                size: 88,
                gridNoise: 50,
                softness: 0,
                contrast: 115,
                scale: 100,
                colorC: '#00B2FF',
                colorM: '#FC4F4F',
                colorY: '#FFD900',
                colorK: '#231F20',
                colorBg: '#EEEFD7',
                gainC: 100,
                gainM: 44,
                gainY: -100,
                gainK: 0,
                floodC: 15,
                floodM: 0,
                floodY: 0,
                floodK: 0,
                grainMixing: 5,
                grainOverlay: 25,
                grainSize: 1
            },
            newspaper: {
                type: 0, // Dots
                size: 1,
                gridNoise: 60,
                softness: 20,
                contrast: 200,
                scale: 100,
                colorC: '#7A7A75',
                colorM: '#7A7A75',
                colorY: '#7A7A75',
                colorK: '#231F20',
                colorBg: '#F2F1E8',
                gainC: -17,
                gainM: -45,
                gainY: -45,
                gainK: 0,
                floodC: 0,
                floodM: 0,
                floodY: 0,
                floodK: 10,
                grainMixing: 0,
                grainOverlay: 20,
                grainSize: 0
            },
            vintage: {
                type: 2, // Sharp
                size: 20,
                gridNoise: 45,
                softness: 40,
                contrast: 125,
                scale: 100,
                colorC: '#59AFC5',
                colorM: '#D8697C',
                colorY: '#FAD85C',
                colorK: '#2D2824',
                colorBg: '#FFFAF0',
                gainC: 30,
                gainM: 0,
                gainY: 20,
                gainK: 0,
                floodC: 15,
                floodM: 0,
                floodY: 0,
                floodK: 0,
                grainMixing: 15,
                grainOverlay: 10,
                grainSize: 50
            }
        };

        this.init();
        this.setupEventListeners();
        this.applyPreset('default'); // Apply default preset
    }

    init() {
        const gl = this.gl;

        // Create shaders
        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        // Create program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(this.program));
            return;
        }

        // Setup geometry (full screen quad)
        const positions = new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1
        ]);

        const texCoords = new Float32Array([
            0, 1, 1, 1, 0, 0,
            0, 0, 1, 1, 1, 0
        ]);

        // Position buffer
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const positionLoc = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        // TexCoord buffer
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

        const texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
        gl.enableVertexAttribArray(texCoordLoc);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

        // Create texture
        this.texture = gl.createTexture();

        gl.useProgram(this.program);
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.originalImage = img;
                this.setImage(img);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    setImage(img) {
        const gl = this.gl;

        // Resize canvas to match image aspect ratio
        const maxSize = 1200;
        let width = img.width;
        let height = img.height;

        if (width > maxSize || height > maxSize) {
            const ratio = Math.min(maxSize / width, maxSize / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
        }

        this.canvas.width = width;
        this.canvas.height = height;
        gl.viewport(0, 0, width, height);

        // Upload texture
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        this.imageLoaded = true;
        document.getElementById('uploadOverlay').classList.add('hidden');
        document.getElementById('downloadBtn').disabled = false;

        this.render();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ] : [0, 0, 0];
    }

    render() {
        if (!this.imageLoaded) return;

        const gl = this.gl;
        gl.useProgram(this.program);

        // Set uniforms
        gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), this.canvas.width, this.canvas.height);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_dotSize'), this.params.dotSize);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_gridNoise'), this.params.gridNoise);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_type'), this.params.type);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_softness'), this.params.softness);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_contrast'), this.params.contrast);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_scale'), this.params.scale * 100);

        gl.uniform1f(gl.getUniformLocation(this.program, 'u_gainC'), this.params.gainC);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_gainM'), this.params.gainM);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_gainY'), this.params.gainY);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_gainK'), this.params.gainK);

        gl.uniform1f(gl.getUniformLocation(this.program, 'u_floodC'), this.params.floodC);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_floodM'), this.params.floodM);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_floodY'), this.params.floodY);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_floodK'), this.params.floodK);

        gl.uniform1f(gl.getUniformLocation(this.program, 'u_grainMixing'), this.params.grainMixing);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_grainOverlay'), this.params.grainOverlay);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_grainSize'), this.params.grainSize);

        gl.uniform3fv(gl.getUniformLocation(this.program, 'u_colorC'), this.params.colorC);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'u_colorM'), this.params.colorM);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'u_colorY'), this.params.colorY);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'u_colorK'), this.params.colorK);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'u_colorBg'), this.params.colorBg);

        // Draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    applyPreset(presetName) {
        const preset = this.presets[presetName];
        if (!preset) return;

        // Update params
        this.params.type = preset.type;
        this.params.dotSize = preset.size;
        this.params.gridNoise = preset.gridNoise / 100;
        this.params.softness = preset.softness / 100;
        this.params.contrast = preset.contrast / 100;
        this.params.scale = preset.scale / 100;

        this.params.colorC = this.hexToRgb(preset.colorC);
        this.params.colorM = this.hexToRgb(preset.colorM);
        this.params.colorY = this.hexToRgb(preset.colorY);
        this.params.colorK = this.hexToRgb(preset.colorK);
        this.params.colorBg = this.hexToRgb(preset.colorBg);

        this.params.gainC = preset.gainC / 100;
        this.params.gainM = preset.gainM / 100;
        this.params.gainY = preset.gainY / 100;
        this.params.gainK = preset.gainK / 100;

        this.params.floodC = preset.floodC / 100;
        this.params.floodM = preset.floodM / 100;
        this.params.floodY = preset.floodY / 100;
        this.params.floodK = preset.floodK / 100;

        this.params.grainMixing = preset.grainMixing / 100;
        this.params.grainOverlay = preset.grainOverlay / 100;
        this.params.grainSize = preset.grainSize / 100;

        // Update UI
        this.updateUI(preset);
        this.render();
    }

    updateUI(preset) {
        // Update sliders
        document.getElementById('size').value = preset.size;
        document.getElementById('sizeValue').textContent = preset.size + '%';

        document.getElementById('gridNoise').value = preset.gridNoise;
        document.getElementById('gridNoiseValue').textContent = preset.gridNoise + '%';

        document.getElementById('softness').value = preset.softness;
        document.getElementById('softnessValue').textContent = preset.softness + '%';

        document.getElementById('contrast').value = preset.contrast;
        document.getElementById('contrastValue').textContent = preset.contrast + '%';

        document.getElementById('scale').value = preset.scale;
        document.getElementById('scaleValue').textContent = preset.scale + '%';

        // Update colors
        document.getElementById('colorC').value = preset.colorC;
        document.getElementById('colorM').value = preset.colorM;
        document.getElementById('colorY').value = preset.colorY;
        document.getElementById('colorK').value = preset.colorK;
        document.getElementById('colorBg').value = preset.colorBg;

        // Update gains
        document.getElementById('gainC').value = preset.gainC;
        document.getElementById('gainM').value = preset.gainM;
        document.getElementById('gainY').value = preset.gainY;
        document.getElementById('gainK').value = preset.gainK;

        // Update floods
        document.getElementById('floodC').value = preset.floodC;
        document.getElementById('floodM').value = preset.floodM;
        document.getElementById('floodY').value = preset.floodY;
        document.getElementById('floodK').value = preset.floodK;

        // Update grain
        document.getElementById('grainMixing').value = preset.grainMixing;
        document.getElementById('grainMixingValue').textContent = preset.grainMixing + '%';

        document.getElementById('grainOverlay').value = preset.grainOverlay;
        document.getElementById('grainOverlayValue').textContent = preset.grainOverlay + '%';

        document.getElementById('grainSize').value = preset.grainSize;
        document.getElementById('grainSizeValue').textContent = preset.grainSize + '%';

        // Update type buttons
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.type) === preset.type);
        });
    }

    download() {
        if (!this.imageLoaded) return;

        const link = document.createElement('a');
        link.download = 'cmyk-halftone.png';
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }

    reset() {
        this.imageLoaded = false;
        this.originalImage = null;
        document.getElementById('uploadOverlay').classList.remove('hidden');
        document.getElementById('downloadBtn').disabled = true;
        this.applyPreset('default');

        // Reset preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === 'default');
        });

        const gl = this.gl;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    setLanguage(lang) {
        this.currentLang = lang;
        const t = translations[lang];

        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) {
                if (el.tagName === 'INPUT') {
                    el.placeholder = t[key];
                } else {
                    el.innerHTML = t[key];
                }
            }
        });

    }

    setupEventListeners() {
        const wrapper = document.getElementById('canvasWrapper');
        const fileInput = document.getElementById('imageInput');

        // Language toggle
        document.getElementById('langToggle').addEventListener('click', () => {
            const newLang = this.currentLang === 'zh' ? 'en' : 'zh';
            this.setLanguage(newLang);
        });

        // File input
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.loadImage(e.target.files[0]);
            }
        });

        // Drag and drop
        wrapper.addEventListener('dragover', (e) => {
            e.preventDefault();
            wrapper.classList.add('drag-over');
        });

        wrapper.addEventListener('dragleave', () => {
            wrapper.classList.remove('drag-over');
        });

        wrapper.addEventListener('drop', (e) => {
            e.preventDefault();
            wrapper.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) {
                this.loadImage(e.dataTransfer.files[0]);
            }
        });

        // Presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.applyPreset(btn.dataset.preset);
            });
        });

        // Type buttons
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.params.type = parseInt(btn.dataset.type);
                this.render();
            });
        });

        // Sliders
        const sliders = [
            { id: 'size', param: 'dotSize', display: 'sizeValue', format: v => v + '%', divisor: 1 },
            { id: 'gridNoise', param: 'gridNoise', display: 'gridNoiseValue', format: v => v + '%', divisor: 100 },
            { id: 'softness', param: 'softness', display: 'softnessValue', format: v => v + '%', divisor: 100 },
            { id: 'contrast', param: 'contrast', display: 'contrastValue', format: v => v + '%', divisor: 100 },
            { id: 'scale', param: 'scale', display: 'scaleValue', format: v => v + '%', divisor: 100 },
            { id: 'grainMixing', param: 'grainMixing', display: 'grainMixingValue', format: v => v + '%', divisor: 100 },
            { id: 'grainOverlay', param: 'grainOverlay', display: 'grainOverlayValue', format: v => v + '%', divisor: 100 },
            { id: 'grainSize', param: 'grainSize', display: 'grainSizeValue', format: v => v + '%', divisor: 100 }
        ];

        sliders.forEach(({ id, param, display, format, divisor }) => {
            const slider = document.getElementById(id);
            slider.addEventListener('input', () => {
                const value = parseFloat(slider.value);
                this.params[param] = value / divisor;
                document.getElementById(display).textContent = format(value);
                this.render();
            });
        });

        // Gain inputs
        const gains = ['gainC', 'gainM', 'gainY', 'gainK'];
        gains.forEach(id => {
            document.getElementById(id).addEventListener('input', (e) => {
                this.params[id] = parseFloat(e.target.value) / 100;
                this.render();
            });
        });

        // Flood inputs
        const floods = ['floodC', 'floodM', 'floodY', 'floodK'];
        floods.forEach(id => {
            document.getElementById(id).addEventListener('input', (e) => {
                this.params[id] = parseFloat(e.target.value) / 100;
                this.render();
            });
        });

        // Color pickers
        const colors = [
            { id: 'colorC', param: 'colorC' },
            { id: 'colorM', param: 'colorM' },
            { id: 'colorY', param: 'colorY' },
            { id: 'colorK', param: 'colorK' },
            { id: 'colorBg', param: 'colorBg' }
        ];

        colors.forEach(({ id, param }) => {
            document.getElementById(id).addEventListener('input', (e) => {
                this.params[param] = this.hexToRgb(e.target.value);
                this.render();
            });
        });

        // Buttons
        document.getElementById('downloadBtn').addEventListener('click', () => this.download());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.halftone = new CMYKHalftone();
});
