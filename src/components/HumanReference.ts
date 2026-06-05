
import type { BoneRetargetingReference } from "./BoneRetargeting";


export function getHumanReference(): BoneRetargetingReference {
    // 1. Core Spinal Bones
    const spinal = [
        { name: 'pelvis', x: 50, y: 45 },
        { name: 'spine_01', x: 50, y: 37 },
        { name: 'spine_02', x: 50, y: 29 },
        { name: 'spine_03', x: 50, y: 20 },
        { name: 'neck', x: 50, y: 12 },
        { name: 'head', x: 50, y: 5 },
    ];

    // 2. Right Limbs (Main Body)
    const rightLimbs = [
        { name: 'shoulder_r', x: 45, y: 20 },
        { name: 'upper_arm_r', x: 40, y: 20 },
        { name: 'lower_arm_r', x: 37.5, y: 35 },
        { name: 'hand_r', x: 36, y: 46 },
        { name: 'upper_leg_r', x: 44, y: 52 },
        { name: 'lower_leg_r', x: 44, y: 70 },
        { name: 'foot_r', x: 45, y: 90 },
    ];

    // 3. Right Fingers
    const rightFingers = [
        // Pinky
        { name: 'finger_pinky_01_r', x: 7.3, y: 36.1 },
        { name: 'finger_pinky_02_r', x: 5.2, y: 32.7 },
        { name: 'finger_pinky_03_r', x: 3.7, y: 29.5 },

        // Ring
        { name: 'finger_ring_01_r', x: 11.8, y: 34.2 },
        { name: 'finger_ring_02_r', x: 11.0, y: 29.5 },
        { name: 'finger_ring_03_r', x: 11.0, y: 24.3 },

        // Middle
        { name: 'finger_middle_01_r', x: 15.3, y: 33.7 },
        { name: 'finger_middle_02_r', x: 15.3, y: 28.5 },
        { name: 'finger_middle_03_r', x: 15.3, y: 22.8 },

        // Index
        { name: 'finger_index_01_r', x: 20.0, y: 33.3 },
        { name: 'finger_index_02_r', x: 20.0, y: 29.7 },
        { name: 'finger_index_03_r', x: 22.0, y: 25.4 },

        // Thumb
        { name: 'finger_thumb_01_r', x: 22.6, y: 44.7 },
        { name: 'finger_thumb_02_r', x: 24.6, y: 42.8 },
        { name: 'finger_thumb_03_r', x: 27.5, y: 38.0 }
    ];

    // 4. Hardcoded Right Toes (Mapped from your coordinates * 100)
    // Order provided: Pinky -> Index -> Middle -> Ring -> Big
    const rightToes = [
        // Pinky Toe
        { name: 'toe_pinky_01_r', x: 5.6, y: 93.3 }, // Fixed 0.56 placement typo to 0.056
        { name: 'toe_pinky_02_r', x: 5.1, y: 88.6 },

        // Ring Toe
        { name: 'toe_ring_01_r', x: 10.6, y: 88.6 },
        { name: 'toe_ring_02_r', x: 9.2, y: 83.2 },

        // Middle Toe
        { name: 'toe_middle_01_r', x: 15.7, y: 84.4 },
        { name: 'toe_middle_02_r', x: 14.8, y: 79.6 },

        // Index Toe
        { name: 'toe_index_01_r', x: 20.7, y: 82.9 },
        { name: 'toe_index_02_r', x: 20.9, y: 75.9 },

        // Big Toe
        { name: 'toe_big_01_r', x: 30.5, y: 83.6 },
        { name: 'toe_big_02_r', x: 31.2, y: 74.0 },

        // non toes
        { name: 'toes_r', x: 19.2, y: 94.5 }
    ];

    // Combine all right side elements
    const rightAll = rightLimbs.concat(rightFingers).concat(rightToes);

    // 5. Mirror to Left Side
    // Automatically handles the flip (100 - X) for everything, including toes!
    const leftAll = rightAll.map(p => {
        let leftName = p.name;
        if (leftName.endsWith('_r')) {
            leftName = leftName.slice(0, -2) + '_l';
        }
        return {
            ...p,
            name: leftName,
            x: Math.round((100 - p.x) * 10) / 10
        };
    });

    return {
        imageUrl: '/human_body.png',
        bones: spinal.concat(rightAll).concat(leftAll)
    };
}