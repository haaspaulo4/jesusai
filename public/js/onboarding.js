// MetaPersona.AI — Enhanced Onboarding & Ongoing UX
// This module enhances the main app.js with wizard-style onboarding and smart UX

const MPOnboarding = {
  // State
  steps: [],
  currentStepIndex: 0,
  answers: {},
  totalSteps: 0,
  completedSteps: 0,
  isLoading: false,
  isComplete: false,
  showCelebration: false,

  // Quick actions
  quickActions: [],
  contextualWelcome: '',

  async loadSteps(personaId, userId, lang) {
    try {
      const params = new URLSearchParams({ personaId: personaId || '', userId: userId || '', lang: lang || 'pt-BR' });
      const res = await fetch(`/api/onboarding/steps?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      this.steps = data.steps || [];
      this.totalSteps = data.status?.totalSteps || this.steps.length;
      this.completedSteps = data.status?.completedSteps || 0;
      this.isComplete = data.status?.done || false;

      const answeredState = data.status?.done ? true : false;
      if (data.status?.done) {
        this.isComplete = true;
      }
    } catch (e) {
      console.error('[Onboarding] Failed to load steps:', e);
    }
  },

  getCurrentStep() {
    return this.steps[this.currentStepIndex] || null;
  },

  async submitAnswer(stepKey, answer, userId, personaId, lang) {
    try {
      const res = await fetch('/api/onboarding/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, stepKey, answer, personaId, lang }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      this.completedSteps = data.completedSteps || this.completedSteps + 1;
      this.totalSteps = data.totalSteps || this.totalSteps;
      if (data.done) {
        this.isComplete = true;
        this.showCelebration = true;
        setTimeout(() => { this.showCelebration = false; }, 3000);
      } else if (data.nextStep) {
        this.currentStepIndex = this.steps.findIndex(s => s.stepKey === data.nextStep.stepKey);
        if (this.currentStepIndex === -1) this.currentStepIndex++;
      } else {
        this.currentStepIndex++;
      }
      return data;
    } catch (e) {
      console.error('[Onboarding] Failed to submit answer:', e);
      return null;
    }
  },

  skipStep() {
    this.currentStepIndex++;
  },

  getProgressPercent() {
    if (this.totalSteps === 0) return 0;
    return Math.round((this.completedSteps / this.totalSteps) * 100);
  },

  async loadWelcome(userId, personaId, lang) {
    try {
      const params = new URLSearchParams({ userId: userId || '', personaId: personaId || '', lang: lang || 'pt-BR' });
      const res = await fetch(`/api/welcome?${params}`);
      if (!res.ok) return '';
      const data = await res.json();
      this.contextualWelcome = data.welcome || '';
      return data.welcome;
    } catch (e) { return ''; }
  },

  async loadQuickActions(personaId, userId) {
    try {
      const params = new URLSearchParams({ personaId: personaId || '', userId: userId || '' });
      const res = await fetch(`/api/quick-actions?${params}`);
      if (!res.ok) return [];
      const data = await res.json();
      this.quickActions = data.actions || [];
      return data.actions;
    } catch (e) { return []; }
  },
};

if (typeof window !== 'undefined') {
  window.MPOnboarding = MPOnboarding;
}