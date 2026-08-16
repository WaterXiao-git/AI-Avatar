<script setup>
import TopBar from './components/TopBar.vue'
import AttractionList from './components/AttractionList.vue'
import MapPanel from './components/MapPanel.vue'
import DigitalHuman from './components/DigitalHuman.vue'
import ChatPanel from './components/ChatPanel.vue'
import RouteCardRow from './components/RouteCardRow.vue'
</script>

<template>
  <div class="page">
    <TopBar />
    <main class="main">
      <section class="col-left">
        <AttractionList />
        <MapPanel />
      </section>
      <section class="col-center">
        <DigitalHuman />
      </section>
      <section class="col-right">
        <ChatPanel />
      </section>
    </main>
    <RouteCardRow />
  </div>
</template>

<style scoped>
.main {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr 380px;
  gap: 10px;
  min-height: 0;
}
.col-left { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.col-center { display: flex; align-items: stretch; min-height: 0; }
.col-right { display: flex; flex-direction: column; min-height: 0; }

@media (max-width: 1200px) {
  .main { grid-template-columns: 260px 1fr; }
  .col-right { grid-column: 1 / -1; max-height: 320px; }
}
@media (max-width: 900px) {
  .main { grid-template-columns: 1fr; }
  .col-center { min-height: 340px; }
  .col-right { grid-column: auto; max-height: none; }
}
</style>
