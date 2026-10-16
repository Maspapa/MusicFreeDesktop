import type { LearningBridge } from './common';
declare global {
    interface Window {
        learningBridge: LearningBridge;
    }
}
export default window.learningBridge;
