import { mount } from 'svelte';
import '../shared/styles/tokens.css';
import { initUiPrefs } from '../shared/ui-prefs';
import App from './App.svelte';

initUiPrefs();

const target = document.getElementById('app');
if (!target) {
  throw new Error('Side panel mount target #app not found');
}

mount(App, { target });
