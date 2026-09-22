package com.app.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class AttrModel {
    private String name;
    private String type;
    private long version = 0L;
    private Boolean isPrimary = false;
    private Boolean isForeignKey = false;
    private String fkReferencedClass;

    public AttrModel(String name, String type) {
        this.name = name;
        this.type = type;
    }
}
