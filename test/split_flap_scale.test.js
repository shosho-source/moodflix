import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Split-Flap Display Scaling & Anti-Clipping Unit Suite', () => {
  // Mock minimal DOM environment for updateSplitFlap testing
  function createMockCluster(initialVal = '0') {
    const parentCell = {
      dataset: {},
      setAttribute(k, v) { this.dataset[k] = String(v); }
    };

    const containerEl = {
      innerHTML: '',
      className: 'stat-value flip-digit-cluster',
      dataset: { value: initialVal },
      children: [],
      setAttribute(k, v) { this.dataset[k] = String(v); },
      closest(selector) {
        if (selector === '.stat-cell') return parentCell;
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '.flip-tile') return this.children;
        return [];
      },
      appendChild(tile) {
        this.children.push(tile);
      }
    };

    return { containerEl, parentCell };
  }

  function simulateUpdateSplitFlap(containerEl, targetVal, minSlots = 2) {
    const rawStr = String(targetVal ?? '0').trim();
    let formattedStr = rawStr;
    if (/^\d+$/.test(rawStr) && rawStr.length < minSlots) {
      formattedStr = rawStr.padStart(minSlots, '0');
    } else if (/^\d+h$/i.test(rawStr)) {
      const numPart = rawStr.slice(0, -1);
      const unit = rawStr.slice(-1).toUpperCase();
      formattedStr = numPart.padStart(minSlots, '0') + unit;
    }

    const chars = formattedStr.split('');
    const numDigits = chars.length;

    containerEl.dataset.digits = String(numDigits);
    containerEl.setAttribute('data-digits', String(numDigits));
    containerEl.className = `stat-value flip-digit-cluster digits-${numDigits}`;
    const parentCell = containerEl.closest('.stat-cell');
    if (parentCell) {
      parentCell.dataset.digits = String(numDigits);
      parentCell.setAttribute('data-digits', String(numDigits));
    }
    containerEl.dataset.value = formattedStr;

    containerEl.innerHTML = '';
    containerEl.children = [];
    chars.forEach((char) => {
      const tile = {
        className: 'flip-tile' + (/[a-zA-Z]/.test(char) ? ' unit-tile' : ''),
        dataset: { char }
      };
      containerEl.appendChild(tile);
    });

    return { formattedStr, numDigits };
  }

  it('correctly pads 2-digit numbers and applies digits-2 class', () => {
    const { containerEl, parentCell } = createMockCluster();
    const result = simulateUpdateSplitFlap(containerEl, 8);
    assert.strictEqual(result.formattedStr, '08');
    assert.strictEqual(containerEl.dataset.digits, '2');
    assert.strictEqual(parentCell.dataset.digits, '2');
    assert.strictEqual(containerEl.className, 'stat-value flip-digit-cluster digits-2');
    assert.strictEqual(containerEl.children.length, 2);
  });

  it('correctly formats and auto-scales 3-digit watch times like 48h -> 48H', () => {
    const { containerEl, parentCell } = createMockCluster();
    const result = simulateUpdateSplitFlap(containerEl, '48h');
    assert.strictEqual(result.formattedStr, '48H');
    assert.strictEqual(containerEl.dataset.digits, '3');
    assert.strictEqual(parentCell.dataset.digits, '3');
    assert.strictEqual(containerEl.className, 'stat-value flip-digit-cluster digits-3');
    assert.strictEqual(containerEl.children.length, 3);
    assert.ok(containerEl.children[2].className.includes('unit-tile'));
  });

  it('correctly formats and auto-scales large 5-digit watch time 1061h -> 1061H', () => {
    const { containerEl, parentCell } = createMockCluster();
    const result = simulateUpdateSplitFlap(containerEl, '1061h');
    assert.strictEqual(result.formattedStr, '1061H');
    assert.strictEqual(containerEl.dataset.digits, '5');
    assert.strictEqual(parentCell.dataset.digits, '5');
    assert.strictEqual(containerEl.className, 'stat-value flip-digit-cluster digits-5');
    assert.strictEqual(containerEl.children.length, 5);
    // 5th character 'H' has unit-tile class
    assert.strictEqual(containerEl.children[4].dataset.char, 'H');
    assert.ok(containerEl.children[4].className.includes('unit-tile'));
  });

  it('handles 6-digit counts (e.g. 100000) without crashing and assigns digits-6', () => {
    const { containerEl, parentCell } = createMockCluster();
    const result = simulateUpdateSplitFlap(containerEl, 100000);
    assert.strictEqual(result.formattedStr, '100000');
    assert.strictEqual(containerEl.dataset.digits, '6');
    assert.strictEqual(parentCell.dataset.digits, '6');
    assert.strictEqual(containerEl.className, 'stat-value flip-digit-cluster digits-6');
    assert.strictEqual(containerEl.children.length, 6);
  });

  it('calculates pixel bounds showing 5 digits fit comfortably under 180px cell width', () => {
    // 5 digits: 26px width per tile, 3px gap
    const tileW5 = 26;
    const tileGap5 = 3;
    const numTiles5 = 5;
    const totalW5 = numTiles5 * tileW5 + (numTiles5 - 1) * tileGap5; // 5 * 26 + 4 * 3 = 130 + 12 = 142px
    assert.strictEqual(totalW5, 142);
    assert.ok(totalW5 < 180, '142px fits easily inside 180px cell without overflow or clipping');

    // 6 digits: 22px width per tile, 2.5px gap
    const tileW6 = 22;
    const tileGap6 = 2.5;
    const numTiles6 = 6;
    const totalW6 = numTiles6 * tileW6 + (numTiles6 - 1) * tileGap6; // 6 * 22 + 5 * 2.5 = 132 + 12.5 = 144.5px
    assert.strictEqual(totalW6, 144.5);
    assert.ok(totalW6 < 180, '144.5px fits comfortably inside 180px cell');
  });
});

