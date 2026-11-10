package com.securevault.crypto;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.util.HexFormat;
import java.util.List;
import org.bouncycastle.crypto.generators.Argon2BytesGenerator;
import org.bouncycastle.crypto.params.Argon2Parameters;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * The frontend checks its Argon2id library against these vectors. Recomputing them here with Bouncy
 * Castle means the shared file cannot be edited to match a broken implementation.
 */
class Argon2idVectorsTest {

  private static final File VECTORS =
      new File("../frontend/src/crypto/testdata/argon2id-vectors.json");

  record Vector(
      String name,
      String passwordHex,
      String saltHex,
      int memoryKib,
      int iterations,
      int parallelism,
      String outputHex) {}

  record VectorFile(String source, List<Vector> vectors) {}

  @Test
  void bouncyCastleReproducesEverySharedVector() {
    VectorFile file = JsonMapper.builder().build().readValue(VECTORS, VectorFile.class);
    assertThat(file.vectors()).hasSizeGreaterThanOrEqualTo(8);

    HexFormat hex = HexFormat.of();
    for (Vector v : file.vectors()) {
      Argon2BytesGenerator generator = new Argon2BytesGenerator();
      generator.init(
          new Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
              .withVersion(Argon2Parameters.ARGON2_VERSION_13)
              .withMemoryAsKB(v.memoryKib())
              .withIterations(v.iterations())
              .withParallelism(v.parallelism())
              .withSalt(hex.parseHex(v.saltHex()))
              .build());
      byte[] out = new byte[32];
      generator.generateBytes(hex.parseHex(v.passwordHex()), out);
      assertThat(hex.formatHex(out)).as(v.name()).isEqualTo(v.outputHex());
    }
  }
}
