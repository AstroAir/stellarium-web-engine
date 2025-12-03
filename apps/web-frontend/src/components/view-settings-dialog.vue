// Stellarium Web - Copyright (c) 2022 - Stellarium Labs SRL
//
// This program is licensed under the terms of the GNU AGPL v3, or
// alternatively under a commercial licence.
//
// The terms of the AGPL v3 license can be found in the main directory of this
// repository.

<template>
<v-dialog max-width='600' v-model="$store.state.showViewSettingsDialog" scrollable>
<v-card v-if="$store.state.showViewSettingsDialog" class="secondary white--text">
  <v-card-title><div class="text-h5">{{ $t('View settings') }}</div></v-card-title>
  <v-card-text style="max-height: 70vh;">
    <!-- Sky Display Settings -->
    <v-subheader class="pl-0">{{ $t('Sky Display') }}</v-subheader>
    <v-checkbox hide-details :label="$t('Milky Way')" v-model="milkyWayOn"></v-checkbox>
    <v-checkbox hide-details :label="$t('DSS')" v-model="dssOn"></v-checkbox>
    <v-checkbox hide-details :label="$t('Atmosphere')" v-model="atmosphereOn"></v-checkbox>
    <v-checkbox hide-details :label="$t('Landscape')" v-model="landscapeOn"></v-checkbox>

    <!-- Grid Lines -->
    <v-subheader class="pl-0 mt-4">{{ $t('Grid Lines') }}</v-subheader>
    <v-checkbox hide-details :label="$t('Meridian Line')" v-model="meridianOn"></v-checkbox>
    <v-checkbox hide-details :label="$t('Ecliptic Line')" v-model="eclipticOn"></v-checkbox>
    <v-checkbox hide-details :label="$t('Equatorial Grid')" v-model="equatorialGridOn"></v-checkbox>
    <v-checkbox hide-details :label="$t('Azimuthal Grid')" v-model="azimuthalGridOn"></v-checkbox>

    <!-- Constellation Settings -->
    <v-subheader class="pl-0 mt-4">{{ $t('Constellations') }}</v-subheader>
    <v-checkbox hide-details :label="$t('Constellation Lines')" v-model="constellationLinesOn"></v-checkbox>
    <v-checkbox hide-details :label="$t('Constellation Labels')" v-model="constellationLabelsOn"></v-checkbox>
    <v-checkbox hide-details :label="$t('Constellation Art')" v-model="constellationArtOn"></v-checkbox>

    <!-- Performance Settings -->
    <v-subheader class="pl-0 mt-4">{{ $t('Performance') }}</v-subheader>
    <v-select
      v-model="performanceMode"
      :items="performanceModes"
      :label="$t('Performance Mode')"
      outlined
      dense
      hide-details
      class="mt-2"
    ></v-select>

    <v-slider
      v-model="renderQuality"
      :label="$t('Render Quality')"
      :min="0"
      :max="2"
      :step="1"
      :tick-labels="['Low', 'Medium', 'High']"
      ticks="always"
      class="mt-4"
      hide-details
    ></v-slider>

    <v-slider
      v-model="labelDensity"
      :label="$t('Label Density')"
      :min="0.2"
      :max="1.0"
      :step="0.1"
      class="mt-4"
      hide-details
    ></v-slider>

    <!-- Mobile Touch Settings (only show on touch devices) -->
    <template v-if="isTouchDevice">
      <v-subheader class="pl-0 mt-4">{{ $t('Touch Controls') }}</v-subheader>
      <v-checkbox hide-details :label="$t('Zoom Inertia')" v-model="pinchInertiaEnabled"></v-checkbox>
      <v-checkbox hide-details :label="$t('Pan Inertia')" v-model="panInertiaEnabled"></v-checkbox>

      <v-slider
        v-model="panSensitivity"
        :label="$t('Pan Sensitivity')"
        :min="0.5"
        :max="2.0"
        :step="0.1"
        class="mt-2"
        hide-details
      ></v-slider>

      <v-slider
        v-model="zoomSensitivity"
        :label="$t('Zoom Sensitivity')"
        :min="0.5"
        :max="2.0"
        :step="0.1"
        class="mt-2"
        hide-details
      ></v-slider>
    </template>

    <!-- FPS Display -->
    <v-subheader class="pl-0 mt-4">{{ $t('Debug') }}</v-subheader>
    <v-checkbox hide-details :label="$t('Show FPS')" v-model="showFPS"></v-checkbox>
  </v-card-text>
  <v-card-actions>
    <v-btn text @click.native="resetToDefaults">{{ $t('Reset') }}</v-btn>
    <v-spacer></v-spacer>
    <v-btn class="blue--text darken-1" text @click.native="$store.state.showViewSettingsDialog = false">{{ $t('Close') }}</v-btn>
  </v-card-actions>
</v-card>
</v-dialog>
</template>

<script>
import swh from '@/assets/sw_helpers.js'

export default {
  data: function () {
    return {
      performanceModes: [
        { text: this.$t('Low Power'), value: 'low' },
        { text: this.$t('Balanced'), value: 'medium' },
        { text: this.$t('High Performance'), value: 'high' }
      ]
    }
  },
  computed: {
    isTouchDevice: function () {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0
    },
    dssOn: {
      get: function () {
        return this.$store.state.stel.dss.visible
      },
      set: function (newValue) {
        this.$stel.core.dss.visible = newValue
      }
    },
    milkyWayOn: {
      get: function () {
        return this.$store.state.stel.milkyway.visible
      },
      set: function (newValue) {
        this.$stel.core.milkyway.visible = newValue
      }
    },
    atmosphereOn: {
      get: function () {
        return this.$store.state.stel.atmosphere ? this.$store.state.stel.atmosphere.visible : false
      },
      set: function (newValue) {
        if (this.$stel.core.atmosphere) {
          this.$stel.core.atmosphere.visible = newValue
        }
      }
    },
    landscapeOn: {
      get: function () {
        return this.$store.state.stel.landscapes ? this.$store.state.stel.landscapes.visible : false
      },
      set: function (newValue) {
        if (this.$stel.core.landscapes) {
          this.$stel.core.landscapes.visible = newValue
        }
      }
    },
    meridianOn: {
      get: function () {
        return this.$store.state.stel.lines.meridian.visible
      },
      set: function (newValue) {
        this.$stel.core.lines.meridian.visible = newValue
      }
    },
    eclipticOn: {
      get: function () {
        return this.$store.state.stel.lines.ecliptic.visible
      },
      set: function (newValue) {
        this.$stel.core.lines.ecliptic.visible = newValue
      }
    },
    equatorialGridOn: {
      get: function () {
        return this.$store.state.stel.lines.equatorial ? this.$store.state.stel.lines.equatorial.visible : false
      },
      set: function (newValue) {
        if (this.$stel.core.lines.equatorial) {
          this.$stel.core.lines.equatorial.visible = newValue
        }
      }
    },
    azimuthalGridOn: {
      get: function () {
        return this.$store.state.stel.lines.azimuthal ? this.$store.state.stel.lines.azimuthal.visible : false
      },
      set: function (newValue) {
        if (this.$stel.core.lines.azimuthal) {
          this.$stel.core.lines.azimuthal.visible = newValue
        }
      }
    },
    constellationLinesOn: {
      get: function () {
        return this.$store.state.stel.constellations ? this.$store.state.stel.constellations.lines_visible : false
      },
      set: function (newValue) {
        if (this.$stel.core.constellations) {
          this.$stel.core.constellations.lines_visible = newValue
        }
      }
    },
    constellationLabelsOn: {
      get: function () {
        return this.$store.state.stel.constellations ? this.$store.state.stel.constellations.labels_visible : false
      },
      set: function (newValue) {
        if (this.$stel.core.constellations) {
          this.$stel.core.constellations.labels_visible = newValue
        }
      }
    },
    constellationArtOn: {
      get: function () {
        return this.$store.state.stel.constellations ? this.$store.state.stel.constellations.images_visible : false
      },
      set: function (newValue) {
        if (this.$stel.core.constellations) {
          this.$stel.core.constellations.images_visible = newValue
        }
      }
    },
    performanceMode: {
      get: function () {
        return swh.getPerformanceMode()
      },
      set: function (newValue) {
        swh.setPerformanceMode(newValue)
      }
    },
    renderQuality: {
      get: function () {
        return this.$store.state.stel.render_quality_level || 2
      },
      set: function (newValue) {
        this.$stel.core.render_quality_level = newValue
      }
    },
    labelDensity: {
      get: function () {
        return this.$store.state.stel.render_label_density || 1.0
      },
      set: function (newValue) {
        this.$stel.core.render_label_density = newValue
      }
    },
    pinchInertiaEnabled: {
      get: function () {
        return this.$store.state.stel.pinch_inertia_enabled !== false
      },
      set: function (newValue) {
        this.$stel.core.pinch_inertia_enabled = newValue
      }
    },
    panInertiaEnabled: {
      get: function () {
        return this.$store.state.stel.pan_inertia_enabled !== false
      },
      set: function (newValue) {
        this.$stel.core.pan_inertia_enabled = newValue
      }
    },
    panSensitivity: {
      get: function () {
        return this.$store.state.stel.touch_pan_sensitivity || 1.0
      },
      set: function (newValue) {
        this.$stel.core.touch_pan_sensitivity = newValue
      }
    },
    zoomSensitivity: {
      get: function () {
        return this.$store.state.stel.touch_zoom_sensitivity || 1.0
      },
      set: function (newValue) {
        this.$stel.core.touch_zoom_sensitivity = newValue
      }
    },
    showFPS: {
      get: function () {
        return this.$store.state.showFPS
      },
      set: function (newValue) {
        this.$store.commit('setValue', { varName: 'showFPS', newValue: newValue })
      }
    }
  },
  methods: {
    resetToDefaults: function () {
      // Reset view settings to defaults
      this.milkyWayOn = true
      this.dssOn = true
      this.atmosphereOn = true
      this.landscapeOn = true
      this.meridianOn = false
      this.eclipticOn = false
      this.equatorialGridOn = false
      this.azimuthalGridOn = false
      this.constellationLinesOn = true
      this.constellationLabelsOn = true
      this.constellationArtOn = false

      // Reset performance settings
      this.renderQuality = 2
      this.labelDensity = 1.0
      swh.setPerformanceMode('high')

      // Reset touch settings
      if (this.isTouchDevice) {
        this.pinchInertiaEnabled = true
        this.panInertiaEnabled = true
        this.panSensitivity = 1.0
        this.zoomSensitivity = 1.0
      }
    }
  }
}
</script>

<style>
.input-group {
  margin: 0px;
}
</style>
