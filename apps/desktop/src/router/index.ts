import { createRouter, createWebHashHistory } from 'vue-router';
import PetPage from '../pages/pet/index.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: PetPage,
    },
    {
      path: '/settings',
      component: () => import('../pages/settings/index.vue'),
    },
  ],
});

export default router;
