"use strict";

function randomString(len, charSet) {
  charSet = charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var randomString = '';
  for (var i = 0; i < len; i++) {
    var randomPoz = Math.floor(Math.random() * charSet.length);
    randomString += charSet.substring(randomPoz, randomPoz + 1);
  }
  return randomString;
}

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}

function str2ab(str) {
  var buf = new ArrayBuffer(str.length * 2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

QUnit.test( "LZString reversibility", function( assert ) {
  for (var i = 0; i < 1000; i++) {
    var str = randomString(i);
    var compressed = LZString.compressToUint8Array(str);
    assert.ok(compressed instanceof Uint8Array);
    var decompressed = LZString.decompressFromUint8Array(compressed);
    assert.strictEqual(decompressed, str);
  }
});

var crypto_test = function(assert, plain, pw) {
  assert.ok(plain instanceof ArrayBuffer);
  assert.strictEqual(typeof pw, "string");

  var done = assert.async();
  encrypt(pw, plain).then(function(encrypted_data) {
    assert.ok(encrypted_data instanceof ArrayBuffer);
    decrypt(pw, encrypted_data).then(function(decrypted_data) {
      assert.ok(decrypted_data instanceof ArrayBuffer);
      assert.strictEqual(ab2str(plain), ab2str(decrypted_data));
      done();
    });
  })
};

QUnit.test( "Crypto reversibility", function( assert ) {
  if (typeof crypto.subtle === 'undefined') {
    // PhantomJS doesn't support WebCrypto.
    assert.expect(0);
    return;
  }
  for (var i = 0; i < 100; i = i * 10 + 1) {
    for (var j = 0; j < 20; j += 10) {
      var str = randomString(i);
      var pw = randomString(j);
      crypto_test(assert, str2ab(str), pw);
    }
  }
});

QUnit.test( "LZString+Crypto reversibility", function( assert ) {
  if (typeof crypto.subtle === 'undefined') {
    // PhantomJS doesn't support WebCrypto.
    assert.expect(0);
    return;
  }
  for (var i = 0; i < 100; i = i * 10 + 1) {
    for (var j = 0; j < 20; j += 10) {
      var str = randomString(i);
      var pw = randomString(j);
      crypto_test(assert, LZString.compressToUint8Array(str).buffer, pw);
    }
  }
});

QUnit.test( "Stego reversibility", function( assert ) {
  var stego = new MarkovTextStego();
  var codec = new stego.Codec(null);
  var model = new stego.NGramModel(2);
  model.import(corpora["prince"]);
  codec.setModel(model);

  // Input length of codec.encode() cannot be 0.
  for (var i = 1; i < 1000; i = i * 4 + 1) {
    var str = randomString(i);

    var steg = codec.encode(str2ab(str));
    assert.strictEqual(typeof steg, "string");

    var decoded = codec.decode($.trim(steg));
    assert.ok(decoded instanceof ArrayBuffer);

    var str2 = ab2str(decoded);
    assert.strictEqual(str2, str);
  }
});

function density_test(assert, ngram, density_limit) {
  var stego = new MarkovTextStego();
  var codec = new stego.Codec(null);
  var model = new stego.NGramModel(ngram);
  model.import(corpora["prince"]);
  codec.setModel(model);

  var iterations = 10;
  var sum = 0;
  for (var i = 0; i < iterations; i++) {
    var str = randomString(100);
    var input = str2ab(str);
    var steg = codec.encode(input);
    var ratio = steg.length / input.byteLength;
    sum += ratio;
  }
  var avg_ratio = sum / iterations;
  assert.ok(avg_ratio < density_limit);
}

QUnit.test( "Stego unigram density", function( assert ) {
  density_test(assert, 1, 10);
});

QUnit.test( "Stego bigram density", function( assert ) {
  density_test(assert, 2, 20);
});

QUnit.test( "LZString+Stego reversibility", function( assert ) {
  var stego = new MarkovTextStego();
  var codec = new stego.Codec(null);
  var model = new stego.NGramModel(2);
  model.import(corpora["prince"]);
  codec.setModel(model);

  for (var i = 0; i < 1000; i = i * 10 + 1) {
    var str = randomString(i);

    var steg = codec.encode(LZString.compressToUint8Array(str));
    assert.strictEqual(typeof steg, "string");

    var decoded = codec.decode($.trim(steg));
    assert.ok(decoded instanceof ArrayBuffer);

    var str2 = LZString.decompressFromUint8Array(new Uint8Array(decoded));
    assert.strictEqual(str2, str);
  }
});

QUnit.test( "Stego word split", function( assert ) {
  var stego = new MarkovTextStego();
  var codec = new stego.Codec(null);
  var model = new stego.NGramModel(2);
  model.import("El FBI reveló la grabación de la conversación entre el atacante de Orlando y los equipos de el equipo de negociación del despacho de la policía de Orlando minutos después de la masacre.");
  codec.setModel(model);

  for (var i = 0; i < 100; i++) {
    var str = randomString(100);

    var steg = codec.encode(str2ab(str));
    assert.strictEqual(typeof steg, "string");
    assert.ok(steg.indexOf("conversación") > -1);
    assert.ok(steg.indexOf("después") > -1);
  }
});

QUnit.test( "Corpus scan", function( assert ) {
  var stego = new MarkovTextStego();
  var codec = new stego.Codec(null);
  $.each(corpora, function(key, value) {
    var model = new stego.NGramModel(2);
    model.import(corpora[key]);
    codec.setModel(model);

    var str = randomString(100);

    var steg = codec.encode(LZString.compressToUint8Array(str));
    assert.strictEqual(typeof steg, "string");

    var decoded = codec.decode($.trim(steg));
    assert.ok(decoded instanceof ArrayBuffer);

    var str2 = LZString.decompressFromUint8Array(new Uint8Array(decoded));
    assert.strictEqual(str2, str);
  });
});

var end_to_end_test = function(assert, plain, pw) {
  assert.strictEqual(typeof plain, "string");
  assert.strictEqual(typeof pw, "string");

  var done = assert.async();
  stegoEncode(plain, pw).then(function(stego) {
    assert.strictEqual(typeof stego, "string");
    stegoDecode(stego, pw).then(function(text) {
      assert.strictEqual(typeof text, "string");
      assert.strictEqual(plain, text);
      done();
    });
  })
};

QUnit.test( "End-to-end reversibility", function( assert ) {
  if (typeof crypto.subtle === 'undefined') {
    // PhantomJS doesn't support WebCrypto.
    assert.expect(0);
    return;
  }
  var model = new stego.NGramModel(2);
  model.import(corpora["prince"]);
  codec.setModel(model);

  for (var i = 0; i < 10000; i = i * 10 + 1) {
    for (var j = 0; j < 20; j += 10) {
      var str = randomString(i);
      var pw = randomString(j);

      end_to_end_test(assert, str, pw);
    }
  }
});
