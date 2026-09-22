package com.app.controllers;

import com.app.dto.room.CreateRoomRequest;
import com.app.dto.room.JoinRoomRequest;
import com.app.dto.room.RoomResponse;
import com.app.services.RoomService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/rooms")
@CrossOrigin("*")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @GetMapping
    public ResponseEntity<List<RoomResponse>> findAll() {
        return ResponseEntity.ok(roomService.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<RoomResponse> findById(@PathVariable Long id) {
        return ResponseEntity.ok(roomService.findById(id));
    }

    @GetMapping("/code/{code}")
    public ResponseEntity<RoomResponse> findByCode(@PathVariable String code) {
        return ResponseEntity.ok(roomService.findByCode(code));
    }

    @PostMapping
    public ResponseEntity<RoomResponse> createRoom(@RequestBody(required = false) CreateRoomRequest request) {
        RoomResponse response = roomService.createRoom(request != null ? request : new CreateRoomRequest());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/join")
    public ResponseEntity<RoomResponse> joinRoom(
            @RequestBody(required = false) JoinRoomRequest request,
            @RequestParam(required = false) String code
    ) {
        String targetCode = (request != null && request.getCode() != null && !request.getCode().isBlank())
                ? request.getCode()
                : code;

        RoomResponse response = roomService.joinRoom(targetCode);
        return ResponseEntity.ok(response);
    }
}
