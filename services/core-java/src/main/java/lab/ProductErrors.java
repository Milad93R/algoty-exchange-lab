package lab;

import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = ProductApi.class)
public class ProductErrors {
  @ExceptionHandler({
    IllegalArgumentException.class,
    org.springframework.dao.EmptyResultDataAccessException.class
  })
  public ResponseEntity<?> bad(Exception e) {
    String m =
        e instanceof org.springframework.dao.EmptyResultDataAccessException
            ? "Resource not found"
            : e.getMessage();
    return ResponseEntity.badRequest().body(Map.of("error", m == null ? "Invalid request" : m));
  }

  @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
  public ResponseEntity<?> conflict(Exception e) {
    return ResponseEntity.status(409)
        .body(
            Map.of(
                "error",
                "The operation conflicts with the current account state. Refresh and retry."));
  }
}
