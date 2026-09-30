import { mount } from 'svelte';
import '../shared/styles/tokens.css';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Side panel mount target #app not found');
}

mount(App, { target });
