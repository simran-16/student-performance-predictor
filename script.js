(function () {
  'use strict';

  /* =====================================================================
     1. FUZZY SYSTEM DEFINITION
     Every fuzzy set is a triangle [a, b, c]: membership rises from 0 at a
     to 1 at b, then falls back to 0 at c.
     ===================================================================== */
  var LEVELS = ['low', 'medium', 'high'];
  var LEVEL_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };
  var LEVEL_COLOR = { low: '#b9674b', medium: '#c4a03a', high: '#5d7a3a' };
  var INPUT_KEYS = ['attendance', 'internal', 'study'];

  var VARS = {
    attendance: { label: 'Attendance', ruleLabel: 'Attendance is', unit: '%', max: 100,
      sets: { low: [0, 0, 50], medium: [0, 50, 100], high: [50, 100, 100] } },
    internal: { label: 'Internal Marks', ruleLabel: 'Internal Marks are', unit: ' marks', max: 100,
      sets: { low: [0, 0, 50], medium: [0, 50, 100], high: [50, 100, 100] } },
    study: { label: 'Study Hours', ruleLabel: 'Study Hours are', unit: ' hrs', max: 10,
      sets: { low: [0, 0, 5], medium: [0, 5, 10], high: [5, 10, 10] } },
    output: { label: 'Performance', unit: '', max: 100,
      sets: { low: [0, 0, 40], medium: [20, 50, 80], high: [60, 100, 100] } }
  };

  var DEFAULTS = { attendance: 75, internal: 60, study: 4 };
  var ALT_DEFAULTS = { attendance: 85, internal: 75, study: 6 };

  /* Triangular membership function */
  function tri(x, a, b, c) {
    if (x === b) return 1;
    if (x < a || x > c) return 0;
    if (x < b) return (x - a) / (b - a);
    return (c - x) / (c - b);
  }

  function membership(varKey, level, x) {
    var s = VARS[varKey].sets[level];
    return tri(x, s[0], s[1], s[2]);
  }

  /* =====================================================================
     2. RULE BASE (3 x 3 x 3 = 27 rules)
     Each rule scores its combination with simple weights:
       points = 7*Attendance + 8*Internal + 5*Study   (Low=0, Medium=1, High=2)
       points < 14  -> Low,  14..27 -> Medium,  28 or more -> High
     Internal marks carry the most weight, then attendance, then study hours.
     ===================================================================== */
  var RULES = (function () {
    var list = [];
    var n = 1;
    for (var a = 0; a < 3; a++) {
      for (var i = 0; i < 3; i++) {
        for (var s = 0; s < 3; s++) {
          var points = 7 * a + 8 * i + 5 * s;
          var out = points < 14 ? 'low' : (points < 28 ? 'medium' : 'high');
          list.push({ id: n++, a: LEVELS[a], i: LEVELS[i], s: LEVELS[s], out: out });
        }
      }
    }
    return list;
  })();

  /* =====================================================================
     3. MAMDANI INFERENCE + CENTROID DEFUZZIFICATION
     ===================================================================== */
  function evaluate(values) {
    // Step 1: fuzzification
    var fuzz = {};
    INPUT_KEYS.forEach(function (k) {
      fuzz[k] = {};
      LEVELS.forEach(function (l) { fuzz[k][l] = membership(k, l, values[k]); });
    });

    // Step 2: rule evaluation (AND = min)
    var levelStrength = { low: 0, medium: 0, high: 0 };
    var rules = RULES.map(function (r) {
      var mA = fuzz.attendance[r.a];
      var mI = fuzz.internal[r.i];
      var mS = fuzz.study[r.s];
      var strength = Math.min(mA, mI, mS);
      if (strength > levelStrength[r.out]) levelStrength[r.out] = strength;
      return { id: r.id, a: r.a, i: r.i, s: r.s, out: r.out, mA: mA, mI: mI, mS: mS, strength: strength, active: strength > 0 };
    });

    // Step 3: aggregation (clip each output set at its strongest rule, combine with max)
    // Step 4: centroid = sum(x * mu(x)) / sum(mu(x))
    var num = 0, den = 0, curve = [];
    for (var x = 0; x <= 100; x += 0.5) {
      var mu = 0;
      for (var k = 0; k < LEVELS.length; k++) {
        var l = LEVELS[k];
        var clipped = Math.min(levelStrength[l], membership('output', l, x));
        if (clipped > mu) mu = clipped;
      }
      curve.push([x, mu]);
      num += x * mu;
      den += mu;
    }
    var score = den > 0 ? num / den : 0;

    return { values: values, fuzz: fuzz, rules: rules, levelStrength: levelStrength, curve: curve, score: score };
  }

  function categorize(score) {
    if (score < 40) return { label: 'Needs Improvement', cls: 'poor' };
    if (score < 60) return { label: 'Average', cls: 'avg' };
    if (score < 75) return { label: 'Good', cls: 'good' };
    return { label: 'Excellent', cls: 'excellent' };
  }

  /* =====================================================================
     4. HELPERS
     ===================================================================== */
  function $(id) { return document.getElementById(id); }
  function f2(v) { return v.toFixed(2); }

  function fmtInput(key, v) {
    if (key === 'attendance') return v + '%';
    if (key === 'internal') return v + ' / 100';
    return Number(v).toFixed(1) + ' hrs';
  }

  function dominant(fz) {
    var best = 'low';
    LEVELS.forEach(function (l) { if (fz[l] > fz[best]) best = l; });
    return best;
  }

  function setFill(input) {
    var min = parseFloat(input.min), max = parseFloat(input.max), v = parseFloat(input.value);
    input.style.setProperty('--pct', ((v - min) / (max - min)) * 100 + '%');
  }

  function readValues(prefix) {
    var o = {};
    INPUT_KEYS.forEach(function (k) { o[k] = parseFloat($(prefix + k).value); });
    return o;
  }

  function writeValues(prefix, vals) {
    INPUT_KEYS.forEach(function (k) {
      $(prefix + k).value = vals[k];
      setFill($(prefix + k));
    });
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }

  /* =====================================================================
     5. OVERVIEW
     ===================================================================== */
  function buildSuggestions(v, res) {
    var s = [];

    if (v.attendance < 65) s.push({ tone: 'bad', text: 'Attendance (' + v.attendance + '%) is low. Raising it above 75% is likely the quickest improvement, because regular classes reinforce internal marks.' });
    else if (v.attendance < 80) s.push({ tone: 'warn', text: 'Attendance (' + v.attendance + '%) is moderate. Moving towards 85-90% would strengthen this profile.' });
    else s.push({ tone: 'good', text: 'Attendance (' + v.attendance + '%) is strong. Keep it consistent through the semester.' });

    if (v.internal < 40) s.push({ tone: 'bad', text: 'Internal marks (' + v.internal + ') are low. Revisit weak topics, redo past assignments and ask faculty for feedback.' });
    else if (v.internal < 60) s.push({ tone: 'warn', text: 'Internal marks (' + v.internal + ') are average. Regular practice tests and revision can lift them.' });
    else if (v.internal < 75) s.push({ tone: 'warn', text: 'Internal marks (' + v.internal + ') are decent. Targeting 75+ would move the estimate towards the Excellent range.' });
    else s.push({ tone: 'good', text: 'Internal marks (' + v.internal + ') are high. Maintain this level of preparation.' });

    if (v.study < 2) s.push({ tone: 'bad', text: 'Study time (' + v.study.toFixed(1) + ' hrs/day) is very low. Even a fixed 2-3 hour daily slot would help.' });
    else if (v.study < 4) s.push({ tone: 'warn', text: 'Study time (' + v.study.toFixed(1) + ' hrs/day) is modest. Adding focused sessions of 30-60 minutes can help.' });
    else if (v.study <= 7) s.push({ tone: 'good', text: 'Study time (' + v.study.toFixed(1) + ' hrs/day) is healthy. Focus on quality and spaced revision.' });
    else s.push({ tone: 'good', text: 'Study time (' + v.study.toFixed(1) + ' hrs/day) is high. Make sure you also get enough rest and breaks.' });

    if (res.score < 40) s.push({ tone: 'neutral', text: 'Overall estimate is low. Start with one change, for example attendance, and check how the score responds in the What-if tab.' });
    else if (res.score >= 75) s.push({ tone: 'neutral', text: 'Overall estimate is excellent. The goal now is to maintain these habits.' });

    return s;
  }

  function renderOverview(v, res) {
    INPUT_KEYS.forEach(function (k) { $(k + 'Val').textContent = fmtInput(k, v[k]); });

    var cat = categorize(res.score);
    $('scoreValue').textContent = res.score.toFixed(1);
    var badge = $('categoryBadge');
    badge.textContent = cat.label;
    badge.className = 'badge ' + cat.cls;

    var fill = $('progressFill');
    fill.style.width = res.score.toFixed(1) + '%';
    fill.className = 'progress-fill ' + cat.cls;
    var track = $('progressTrack');
    track.setAttribute('aria-valuenow', res.score.toFixed(1));

    $('scoreNote').textContent = 'Centroid of the aggregated output set = ' + res.score.toFixed(2) +
      '. Bands: below 40 Needs Improvement, 40-59 Average, 60-74 Good, 75+ Excellent.';

    $('suggestionsList').innerHTML = buildSuggestions(v, res).map(function (x) {
      return '<li class="' + x.tone + '">' + x.text + '</li>';
    }).join('');

    $('summaryBody').innerHTML = INPUT_KEYS.map(function (k) {
      var fz = res.fuzz[k];
      return '<tr><td>' + VARS[k].label + '</td><td><strong>' + fmtInput(k, v[k]) + '</strong></td><td>' +
        LEVEL_LABEL[dominant(fz)] + '</td><td>' + f2(fz.low) + ' / ' + f2(fz.medium) + ' / ' + f2(fz.high) + '</td></tr>';
    }).join('');
  }

  /* =====================================================================
     6. MEMBERSHIP FUNCTION CHARTS (SVG)
     ===================================================================== */
  function drawChart(svg, key, res) {
    var v = VARS[key];
    var W = 480, H = 270, L = 46, R = 16, T = 22, B = 44;
    var pw = W - L - R, ph = H - T - B;
    function sx(val) { return L + (val / v.max) * pw; }
    function sy(m) { return T + (1 - m) * ph; }

    var s = '';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (g) {
      s += '<line class="grid-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(g) + '" y2="' + sy(g) + '"/>';
      s += '<text x="' + (L - 8) + '" y="' + (sy(g) + 4) + '" text-anchor="end">' + g + '</text>';
    });
    for (var i = 0; i <= 5; i++) {
      var tv = (v.max * i) / 5;
      s += '<text x="' + sx(tv) + '" y="' + (H - B + 18) + '" text-anchor="middle">' + (Number.isInteger(tv) ? tv : tv.toFixed(1)) + '</text>';
    }
    s += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(0) + '" y2="' + sy(0) + '"/>';
    s += '<line class="axis" x1="' + L + '" x2="' + L + '" y1="' + sy(1) + '" y2="' + sy(0) + '"/>';
    s += '<text class="axis-title" x="' + (L + pw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' +
      (key === 'output' ? 'Performance score' : v.label + (v.unit ? ' (' + v.unit.trim() + ')' : '')) + '</text>';
    s += '<text class="axis-title" transform="translate(13 ' + (T + ph / 2) + ') rotate(-90)" text-anchor="middle">Membership (\u03BC)</text>';

    // Aggregated area (output chart only)
    if (key === 'output') {
      var pts = res.curve.map(function (p) { return sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1); }).join(' ');
      s += '<polygon points="' + sx(0) + ',' + sy(0) + ' ' + pts + ' ' + sx(100) + ',' + sy(0) + '" fill="#6b7a3a" fill-opacity="0.28" stroke="#55622d" stroke-width="1.5"/>';
    }

    // Fuzzy sets
    LEVELS.forEach(function (l) {
      var t = v.sets[l];
      var pts2 = sx(t[0]) + ',' + sy(0) + ' ' + sx(t[1]) + ',' + sy(1) + ' ' + sx(t[2]) + ',' + sy(0);
      s += '<polygon points="' + pts2 + '" fill="' + LEVEL_COLOR[l] + '" fill-opacity="' + (key === 'output' ? 0.05 : 0.12) +
        '" stroke="' + LEVEL_COLOR[l] + '" stroke-width="2" stroke-linejoin="round"' + (key === 'output' ? ' stroke-dasharray="5 3"' : '') + '/>';
    });

    if (key === 'output') {
      var cx = sx(res.score);
      s += '<line class="marker" x1="' + cx + '" x2="' + cx + '" y1="' + sy(1) + '" y2="' + sy(0) + '"/>';
      s += '<text class="marker-label" x="' + cx + '" y="' + (T - 7) + '" text-anchor="middle">centroid ' + res.score.toFixed(1) + '</text>';
    } else {
      var x = res.values[key];
      var mx = sx(x);
      s += '<line class="marker" x1="' + mx + '" x2="' + mx + '" y1="' + sy(1) + '" y2="' + sy(0) + '"/>';
      s += '<text class="marker-label" x="' + mx + '" y="' + (T - 7) + '" text-anchor="middle">' + (key === 'study' ? x.toFixed(1) : x) + '</text>';
      LEVELS.forEach(function (l) {
        var m = res.fuzz[key][l];
        if (m > 0) s += '<circle cx="' + mx + '" cy="' + sy(m) + '" r="5" fill="' + LEVEL_COLOR[l] + '" stroke="#fff" stroke-width="2"/>';
      });
    }

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = s;
  }

  function chip(level, label, value) {
    return '<span class="chip"><i style="background:' + LEVEL_COLOR[level] + '"></i>' + label + ' <b>' + value + '</b></span>';
  }

  function renderCharts(res) {
    INPUT_KEYS.forEach(function (k) {
      drawChart($('mf-' + k), k, res);
      $('legend-' + k).innerHTML = LEVELS.map(function (l) {
        return chip(l, LEVEL_LABEL[l] + ' \u03BC =', f2(res.fuzz[k][l]));
      }).join('');
    });
    drawChart($('mf-output'), 'output', res);
    $('legend-output').innerHTML = LEVELS.map(function (l) {
      return chip(l, LEVEL_LABEL[l] + ' clipped at', f2(res.levelStrength[l]));
    }).join('') + '<span class="chip">Centroid <b>' + res.score.toFixed(2) + '</b></span>';
  }

  /* =====================================================================
     7. RULE INSPECTOR
     ===================================================================== */
  function renderRules(res) {
    var filter = $('ruleFilter').value;
    var sort = $('ruleSort').value;
    var list = res.rules.slice();

    if (filter === 'active') list = list.filter(function (r) { return r.active; });
    if (filter === 'inactive') list = list.filter(function (r) { return !r.active; });
    if (sort === 'strength') {
      list.sort(function (x, y) { return (y.strength - x.strength) || (x.id - y.id); });
    }

    var activeCount = res.rules.filter(function (r) { return r.active; }).length;
    $('ruleCount').textContent = '27 rules in total \u00B7 ' + activeCount + ' active \u00B7 ' + (27 - activeCount) + ' inactive \u00B7 showing ' + list.length;

    if (!list.length) {
      $('ruleBody').innerHTML = '<tr><td colspan="5">No rules match this filter.</td></tr>';
      return;
    }

    $('ruleBody').innerHTML = list.map(function (r) {
      var tip = 'min(' + f2(r.mA) + ', ' + f2(r.mI) + ', ' + f2(r.mS) + ')';
      return '<tr class="' + (r.active ? 'active-row' : 'inactive-row') + '">' +
        '<td>' + r.id + '</td>' +
        '<td>IF Attendance is <b>' + LEVEL_LABEL[r.a] + '</b> AND Internal Marks are <b>' + LEVEL_LABEL[r.i] +
        '</b> AND Study Hours are <b>' + LEVEL_LABEL[r.s] + '</b></td>' +
        '<td><span class="then-pill ' + r.out + '">Performance ' + LEVEL_LABEL[r.out] + '</span></td>' +
        '<td title="' + tip + '"><div class="strength-cell"><b>' + f2(r.strength) + '</b><div class="mini"><span style="width:' + (r.strength * 100).toFixed(0) + '%"></span></div></div></td>' +
        '<td><span class="status ' + (r.active ? 'on' : 'off') + '">' + (r.active ? 'Active' : 'Inactive') + '</span></td>' +
        '</tr>';
    }).join('');
  }

  /* =====================================================================
     8. WHAT-IF COMPARISON
     ===================================================================== */
  function renderWhatIf(cur, curRes) {
    var alt = readValues('alt_');
    var altRes = evaluate(alt);

    INPUT_KEYS.forEach(function (k) { $('alt_' + k + 'Val').textContent = fmtInput(k, alt[k]); });

    $('cmpCurrentProfile').textContent = 'Current: ' + INPUT_KEYS.map(function (k) {
      return VARS[k].label + ' ' + fmtInput(k, cur[k]);
    }).join(' \u00B7 ');

    var cc = categorize(curRes.score), ac = categorize(altRes.score);
    $('cmpCurrentScore').textContent = curRes.score.toFixed(1);
    $('cmpAltScore').textContent = altRes.score.toFixed(1);
    $('cmpCurrentBadge').textContent = cc.label;
    $('cmpCurrentBadge').className = 'badge ' + cc.cls;
    $('cmpAltBadge').textContent = ac.label;
    $('cmpAltBadge').className = 'badge ' + ac.cls;
    $('cmpCurrentBar').style.width = curRes.score.toFixed(1) + '%';
    $('cmpCurrentBar').className = 'progress-fill ' + cc.cls;
    $('cmpAltBar').style.width = altRes.score.toFixed(1) + '%';
    $('cmpAltBar').className = 'progress-fill ' + ac.cls;

    var diff = altRes.score - curRes.score;
    var d = $('cmpDelta');
    d.textContent = (diff > 0 ? '+' : '') + diff.toFixed(1) + ' points';
    d.className = 'delta ' + (diff > 0.05 ? 'up' : (diff < -0.05 ? 'down' : 'same'));

    // Insights
    var items = [];
    var changed = INPUT_KEYS.filter(function (k) { return cur[k] !== alt[k]; });

    if (!changed.length) {
      items.push({ tone: 'neutral', text: 'Both profiles are identical. Adjust the alternative sliders to explore a scenario.' });
    } else {
      if (diff > 0.05) items.push({ tone: 'good', text: 'The alternative profile scores ' + diff.toFixed(1) + ' points higher (' + curRes.score.toFixed(1) + ' to ' + altRes.score.toFixed(1) + ').' });
      else if (diff < -0.05) items.push({ tone: 'bad', text: 'The alternative profile scores ' + Math.abs(diff).toFixed(1) + ' points lower (' + curRes.score.toFixed(1) + ' to ' + altRes.score.toFixed(1) + ').' });
      else items.push({ tone: 'neutral', text: 'The two profiles give almost the same score, so these changes barely move the result.' });

      if (cc.label !== ac.label) items.push({ tone: diff >= 0 ? 'good' : 'warn', text: 'The category changes from ' + cc.label + ' to ' + ac.label + '.' });
      else items.push({ tone: 'neutral', text: 'Both profiles stay in the same category: ' + cc.label + '.' });

      var effects = changed.map(function (k) {
        var test = { attendance: cur.attendance, internal: cur.internal, study: cur.study };
        test[k] = alt[k];
        return { key: k, effect: evaluate(test).score - curRes.score };
      }).sort(function (x, y) { return Math.abs(y.effect) - Math.abs(x.effect); });

      effects.forEach(function (e) {
        var sign = e.effect > 0 ? '+' : '';
        items.push({
          tone: e.effect > 0.05 ? 'good' : (e.effect < -0.05 ? 'bad' : 'neutral'),
          text: VARS[e.key].label + ' alone (' + fmtInput(e.key, cur[e.key]) + ' to ' + fmtInput(e.key, alt[e.key]) + ') changes the score by ' + sign + e.effect.toFixed(1) + ' points.'
        });
      });

      if (Math.abs(effects[0].effect) > 0.05) {
        items.push({ tone: 'neutral', text: 'Biggest single driver: ' + VARS[effects[0].key].label + '. Individual effects need not add up exactly to the total because fuzzy rules combine inputs non-linearly.' });
      }
    }

    $('insightsList').innerHTML = items.map(function (x) {
      return '<li class="' + x.tone + '">' + x.text + '</li>';
    }).join('');
  }

  /* =====================================================================
     9. MAIN UPDATE, TABS, EVENTS
     ===================================================================== */
  function updateAll() {
    var values = readValues('');
    var res = evaluate(values);
    renderOverview(values, res);
    renderCharts(res);
    renderRules(res);
    renderWhatIf(values, res);
  }

  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (b) {
      var on = b.getAttribute('data-tab') === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.panel').forEach(function (p) {
      var on = p.id === 'panel-' + name;
      p.classList.toggle('active', on);
      p.hidden = !on;
    });
  }

  function init() {
    // Sliders
    INPUT_KEYS.forEach(function (k) {
      $(k).addEventListener('input', function () { setFill($(k)); updateAll(); });
      $('alt_' + k).addEventListener('input', function () { setFill($('alt_' + k)); updateAll(); });
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
    });

    // Rule controls
    $('ruleFilter').addEventListener('change', updateAll);
    $('ruleSort').addEventListener('change', updateAll);

    // Evaluate
    $('evaluateBtn').addEventListener('click', function () {
      updateAll();
      showTab('overview');
      var card = $('resultCard');
      card.classList.remove('flash');
      void card.offsetWidth;
      card.classList.add('flash');
      toast('Evaluated: ' + $('scoreValue').textContent + ' / 100');
    });

    // Reset
    $('resetBtn').addEventListener('click', function () {
      writeValues('', DEFAULTS);
      writeValues('alt_', ALT_DEFAULTS);
      $('ruleFilter').value = 'all';
      $('ruleSort').value = 'number';
      updateAll();
      toast('Inputs reset to defaults');
    });

    // What-if buttons
    $('copyCurrentBtn').addEventListener('click', function () {
      writeValues('alt_', readValues(''));
      updateAll();
      toast('Alternative set to current profile');
    });
    $('resetAltBtn').addEventListener('click', function () {
      writeValues('alt_', ALT_DEFAULTS);
      updateAll();
      toast('Alternative profile reset');
    });

    // Initial state
    writeValues('', DEFAULTS);
    writeValues('alt_', ALT_DEFAULTS);
    updateAll();
  }

  init();
})();